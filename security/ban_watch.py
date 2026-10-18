#!/usr/bin/env python3
"""IronBandit Ban-Watcher — schlanker fail2ban-Ersatz.

Hintergrund: fail2ban 1.0.2 (Debian 12 / Python 3.11) ist auf diesem LXC an
seinem Client/Server-Socket defekt (JSONDecodeError schon bei Stock-Konfig).
Dieser Watcher liefert dieselbe Schutzfunktion, aber zuverlässig:

  * Er liest die echten Client-IPs (real_ip/X-Real-IP aus dem NPM-XFF) aus dem
    Backend-App-Log und dem web-nginx Access-Log.
  * Login-Brute-Force / Rate-Limit-Treffer / Exploit-Scans lösen einen Ban aus.
  * Gebannt wird über die nginx deny-Liste (banned.conf), die der web-Container
    read-only einbindet — danach `nginx -s reload` im Container.
  * Bans laufen automatisch ab. Interner Zustand liegt in state.json.

Adressiert wird nie die NPM- oder LAN-IP (ignore_nets), damit nie ein
Unbeteiligter oder der Proxy selbst gesperrt wird.
"""

import json
import os
import re
import time
import subprocess
import threading
import ipaddress
from collections import defaultdict, deque

BASE          = "/opt/ironbandit"
BACKEND_LOG   = f"{BASE}/logs/backend/app.log"
NGINX_LOG     = f"{BASE}/logs/nginx/access.log"
BANNED_CONF   = f"{BASE}/fail2ban/banned.conf"
STATE_FILE    = f"{BASE}/security/state.json"
WEB_CONTAINER = "ironbandit-web"

# Netze, die nie gebannt werden (Proxy + private Bereiche)
IGNORE_NETS = [ipaddress.ip_network(n) for n in (
    "127.0.0.0/8", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
)]

# Regeln: (Name, kompiliertes Regex mit Gruppe 'ip', maxretry, findtime_s, bantime_s)
RULES = [
    # Login-Brute-Force: 6 Fehlversuche in 10 min -> 1 h
    ("auth-login", re.compile(r"\| ironbandit \| POST /api/auth/login \S+ 401 \[(?P<ip>[^\]]+)\]"),
     6, 600, 3600),
    # Auth/Share-Rate-Limit ausgereizt: 3 in 10 min -> 1 h
    ("auth-429", re.compile(r"\| ironbandit \| (?:POST|PUT) /api/(?:auth|templates)/\S* \S+ 429 \[(?P<ip>[^\]]+)\]"),
     3, 600, 3600),
    # Exploit-/Scanner-Pfade im nginx-Log: 2 in 10 min -> 24 h
    ("badbots", re.compile(
        r'^(?P<ip>\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+) .*"(?:GET|POST|HEAD) '
        r'[^"]*(?:/\.env|/\.git|/wp-login|/wp-admin|/xmlrpc\.php|/phpmyadmin|'
        r'/vendor/|/\.aws|/actuator|/config\.|/\.ssh|/boaform|/cgi-bin/)'),
     2, 600, 86400),
    # 404-Flut: fängt Scanner, die keinen der obigen Pfade treffen. Im Log
    # standen mehrere Quellen mit hunderten Anfragen auf /proc/self/environ,
    # /graphql, /terraform.tfstate oder /config/secrets.yml, ohne je gebannt zu
    # werden. Die SPA liefert für unbekannte Pfade index.html mit 200 — echte
    # Nutzer erzeugen praktisch keine 404er, 30 pro Minute ist also weit weg
    # von normalem Verhalten.
    ("notfound-flood", re.compile(
        r'^(?P<ip>\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+) \S+ \S+ \[[^\]]*\] "[^"]*" 404 '),
     30, 60, 3600),
]

hits = defaultdict(lambda: defaultdict(deque))   # rule -> ip -> deque[timestamps]
bans = {}                                        # ip -> expiry_epoch (nur HTTP/nginx)

# ── SSH-Schutz (getrennt vom HTTP-Pfad, da SSH nicht über nginx läuft) ─────────
# SSH-Brute-Force wird kernel-seitig via nftables-Set mit Timeout geblockt.
NFT_TABLE = "inet ironbandit_f2b"
NFT_SET   = "banned4"
SSH_MAXRETRY = 4
SSH_FINDTIME = 600
SSH_BANTIME  = 3600
SSH_FAIL_RX = re.compile(
    r"(?:Failed password for(?: invalid user)? \S+ from |"
    r"Invalid user \S+ from |"
    r"Connection closed by (?:invalid|authenticating) user \S+ )"
    r"(?P<ip>\d{1,3}(?:\.\d{1,3}){3})")
ssh_hits = defaultdict(deque)


def nft(*args):
    return subprocess.run(["nft", *args], check=False,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def ensure_nft():
    """Idempotent: Tabelle/Set/Chain/Regel für SSH-Bans anlegen."""
    nft("add", "table", "inet", "ironbandit_f2b")
    nft("add", "set", "inet", "ironbandit_f2b", NFT_SET, "{ type ipv4_addr; flags timeout; }")
    nft("add", "chain", "inet", "ironbandit_f2b", "input",
        "{ type filter hook input priority -5; policy accept; }")
    # Chain leeren bevor die Regel (neu) gesetzt wird — `nft add rule` hängt sonst
    # bei jedem Neustart ein Duplikat an. Das Set (banned4) bleibt davon unberührt.
    nft("flush", "chain", "inet", "ironbandit_f2b", "input")
    nft("add", "rule", "inet", "ironbandit_f2b", "input",
        "tcp", "dport", "22", "ip", "saddr", "@" + NFT_SET, "drop")


def ssh_ban(ip, seconds):
    nft("add", "element", "inet", "ironbandit_f2b", NFT_SET,
        "{ %s timeout %ds }" % (ip, seconds))
    log(f"BAN(ssh) {ip} für {seconds}s (nftables drop tcp/22)")


def ssh_watch():
    """Liest sshd-Fehlversuche aus dem journald-Stream und bannt per nftables."""
    try:
        # '+' = OR zwischen zwei Match-Termen (Feld=Wert): sshd-Zeilen sowohl per
        # _COMM als auch per SYSLOG_IDENTIFIER erfassen. (-t ist eine Option und
        # taugt nicht als OR-Term, daher das explizite SYSLOG_IDENTIFIER=sshd.)
        proc = subprocess.Popen(
            ["journalctl", "_COMM=sshd", "+", "SYSLOG_IDENTIFIER=sshd",
             "-f", "-n", "0", "-o", "cat"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    except Exception as e:
        log(f"SSH-Watch konnte journalctl nicht starten: {e}")
        return
    for line in proc.stdout:
        m = SSH_FAIL_RX.search(line)
        if not m:
            continue
        ip = m.group("ip")
        if is_ignored(ip):
            continue
        now = time.time()
        dq = ssh_hits[ip]
        dq.append(now)
        while dq and dq[0] < now - SSH_FINDTIME:
            dq.popleft()
        if len(dq) >= SSH_MAXRETRY:
            dq.clear()
            ssh_ban(ip, SSH_BANTIME)


def log(msg):
    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} | ban_watch | {msg}", flush=True)


def is_ignored(ip):
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return any(addr in net for net in IGNORE_NETS)


def load_state():
    global bans
    try:
        with open(STATE_FILE) as f:
            bans = {ip: exp for ip, exp in json.load(f).get("bans", {}).items()}
    except (OSError, ValueError):
        bans = {}


def save_state():
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"bans": bans}, f)
    os.replace(tmp, STATE_FILE)


def write_banned_conf():
    """Schreibt die deny-Liste. Rückgabe: True, wenn sich der Inhalt geändert hat.

    Der Vergleich ist wichtig: ein laufender Scanner erzeugt weiter Treffer,
    obwohl er längst gebannt ist (nginx antwortet 403, die Zeile matcht die
    badbots-Regel trotzdem). Ohne diesen Guard würde jede Ban-Verlängerung
    einen `nginx -s reload` auslösen, ohne dass sich die Liste ändert.
    """
    content = "".join(f"deny {ip};\n" for ip in sorted(bans))
    try:
        with open(BANNED_CONF) as f:
            if f.read() == content:
                return False
    except OSError:
        pass
    tmp = BANNED_CONF + ".tmp"
    with open(tmp, "w") as f:
        f.write(content)
    os.replace(tmp, BANNED_CONF)
    return True


def reload_nginx():
    # Nur reloaden wenn Config valide ist — eine kaputte Bann-Liste darf den
    # laufenden Webserver nicht abschießen.
    try:
        subprocess.run(
            ["docker", "exec", WEB_CONTAINER, "sh", "-c", "nginx -t && nginx -s reload"],
            check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15,
        )
    except Exception as e:
        log(f"nginx reload fehlgeschlagen: {e}")


def apply_bans_changed():
    if write_banned_conf():
        reload_nginx()
    save_state()


# Verlängerungen werden pro IP+Regel höchstens alle EXT_LOG_INTERVAL Sekunden
# geloggt — sonst füllt ein einzelner Scanner das Journal mit hunderten Zeilen.
EXT_LOG_INTERVAL = 300
last_ext_log = {}


def ban(ip, seconds, rule):
    """Bannt/verlängert. Rückgabe: 'new', 'extended' oder None (nichts zu tun)."""
    now = time.time()
    new_expiry = now + seconds
    if bans.get(ip, 0) >= new_expiry:
        return None
    first = ip not in bans
    bans[ip] = new_expiry
    if first:
        log(f"BAN {ip} ({rule}) für {seconds}s")
        return "new"
    key = (rule, ip)
    if now - last_ext_log.get(key, 0) >= EXT_LOG_INTERVAL:
        last_ext_log[key] = now
        log(f"BAN {ip} ({rule}) verlängert auf {seconds}s (weiterhin aktiv)")
    return "extended"


def expire_bans():
    now = time.time()
    expired = [ip for ip, exp in bans.items() if exp <= now]
    for ip in expired:
        del bans[ip]
        log(f"UNBAN {ip} (abgelaufen)")
    return bool(expired)


def register_hit(rule_name, ip, maxretry, findtime, bantime):
    now = time.time()
    dq = hits[rule_name][ip]
    dq.append(now)
    while dq and dq[0] < now - findtime:
        dq.popleft()
    if len(dq) >= maxretry:
        dq.clear()
        return ban(ip, bantime, rule_name)
    return None


def process_line(line, rules):
    """Rückgabe: (neuer_ban, nur_verlaengert) — nur ein neuer Ban ändert die
    deny-Liste und rechtfertigt einen nginx-Reload; eine Verlängerung muss
    lediglich irgendwann in state.json landen."""
    new_ban = extended = False
    for name, rx, maxretry, findtime, bantime in rules:
        m = rx.search(line)
        if not m:
            continue
        ip = m.group("ip").strip()
        if is_ignored(ip):
            continue
        result = register_hit(name, ip, maxretry, findtime, bantime)
        if result == "new":
            new_ban = True
        elif result == "extended":
            extended = True
    return new_ban, extended


def tail(paths):
    """Folgt mehreren Logdateien (wie `tail -F`), robust gegen Rotation/Neuanlage."""
    files = {}

    def open_file(p):
        try:
            f = open(p, "r", errors="replace")
            f.seek(0, os.SEEK_END)
            files[p] = [f, os.fstat(f.fileno()).st_ino]
        except OSError:
            files[p] = None

    for p in paths:
        open_file(p)

    while True:
        got_line = False
        for p in paths:
            entry = files.get(p)
            if entry is None:
                open_file(p)
                entry = files.get(p)
                if entry is None:
                    continue
            f, ino = entry
            # Rotation erkennen (Inode-Wechsel/gekürzt)
            try:
                st = os.stat(p)
                if st.st_ino != ino or st.st_size < f.tell():
                    f.close()
                    open_file(p)
                    entry = files.get(p)
                    if entry is None:
                        continue
                    f, ino = entry
            except OSError:
                continue
            for line in f:
                got_line = True
                yield line
        if not got_line:
            time.sleep(1.0)
            yield None   # Idle-Tick, damit der Aufrufer abgelaufene Bans prüfen kann


def main():
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(BANNED_CONF), exist_ok=True)
    load_state()
    expire_bans()
    apply_bans_changed()   # Zustand beim Start mit nginx synchronisieren

    # SSH-Schutz in eigenem Thread (kernel-seitige nftables-Bans)
    ensure_nft()
    threading.Thread(target=ssh_watch, daemon=True).start()

    log(f"gestartet — {len(bans)} aktive HTTP-Bans, SSH-Schutz via nftables aktiv, "
        f"überwache Backend-, nginx- und sshd-Log")

    last_maintenance = 0
    state_dirty = False
    for line in tail([BACKEND_LOG, NGINX_LOG]):
        if line is not None:
            new_ban, extended = process_line(line, RULES)
            if new_ban:
                apply_bans_changed()
                state_dirty = False
            elif extended:
                # Nur die Ablaufzeit hat sich verschoben: kein Reload, das
                # Speichern erledigt der Wartungstakt gebündelt.
                state_dirty = True
        # periodisch abgelaufene Bans entfernen (auch bei ruhigem Log)
        now = time.time()
        if now - last_maintenance > 30:
            last_maintenance = now
            if expire_bans():
                apply_bans_changed()
                state_dirty = False
            elif state_dirty:
                save_state()
                state_dirty = False


if __name__ == "__main__":
    main()
