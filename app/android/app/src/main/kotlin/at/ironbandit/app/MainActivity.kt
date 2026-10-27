package at.ironbandit.app

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Platform side of the app:
 * - "files": "saveFile" (the user picks a location, bytes are written there) and
 *   "openFile" (the user picks a file, its bytes are returned) via the Storage
 *   Access Framework.
 * - "device": rest timer alarm ("scheduleRest", "cancelRest", "askNotify") and
 *   keeping the screen on during a workout ("keepScreenOn").
 */
class MainActivity : FlutterActivity() {
    private var pendingResult: MethodChannel.Result? = null
    private var pendingBytes: ByteArray? = null
    private var pendingRequest = 0

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        MethodChannel(messenger, "at.ironbandit.app/files").setMethodCallHandler { call, result ->
            if (call.method != "saveFile" && call.method != "openFile") {
                return@setMethodCallHandler result.notImplemented()
            }
            if (pendingResult != null) return@setMethodCallHandler result.error("busy", null, null)
            pendingResult = result
            if (call.method == "saveFile") {
                pendingBytes = call.argument<ByteArray>("bytes")
                pendingRequest = SAVE_REQUEST
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = call.argument<String>("mime")
                    putExtra(Intent.EXTRA_TITLE, call.argument<String>("name"))
                }
                startActivityForResult(intent, SAVE_REQUEST)
            } else {
                pendingRequest = OPEN_REQUEST
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                startActivityForResult(intent, OPEN_REQUEST)
            }
        }
        MethodChannel(messenger, "at.ironbandit.app/device").setMethodCallHandler { call, result ->
            when (call.method) {
                "scheduleRest" -> {
                    scheduleRest(
                        call.argument<Number>("at")!!.toLong(),
                        call.argument<String>("title") ?: "",
                        call.argument<String>("body") ?: "",
                        call.argument<String>("channel") ?: "",
                    )
                    result.success(null)
                }
                "cancelRest" -> {
                    alarms().cancel(restIntent(null))
                    getSystemService(NotificationManager::class.java).cancel(RestAlarmReceiver.NOTIFICATION_ID)
                    result.success(null)
                }
                "askNotify" -> {
                    if (Build.VERSION.SDK_INT >= 33 &&
                        checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                    ) {
                        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFY_REQUEST)
                    }
                    result.success(null)
                }
                "keepScreenOn" -> {
                    if (call.argument<Boolean>("on") == true) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    }
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun alarms() = getSystemService(Context.ALARM_SERVICE) as AlarmManager

    /** [texts] = title, body and channel name of the notification. */
    private fun restIntent(texts: Triple<String, String, String>?): PendingIntent {
        val intent = Intent(this, RestAlarmReceiver::class.java)
        if (texts != null) {
            intent.putExtra("title", texts.first).putExtra("body", texts.second).putExtra("channel", texts.third)
        }
        return PendingIntent.getBroadcast(
            this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** One pending rest alarm at a time; a new one replaces the old. */
    private fun scheduleRest(at: Long, title: String, body: String, channel: String) {
        getSystemService(NotificationManager::class.java).cancel(RestAlarmReceiver.NOTIFICATION_ID)
        val alarms = alarms()
        val pi = restIntent(Triple(title, body, channel))
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    }

    @Deprecated("startActivityForResult keeps the activity free of extra dependencies")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != pendingRequest) return
        val result = pendingResult ?: return
        val bytes = pendingBytes
        pendingResult = null
        pendingBytes = null
        pendingRequest = 0
        val uri = data?.data
        if (requestCode == OPEN_REQUEST) {
            if (resultCode != Activity.RESULT_OK || uri == null) return result.success(null)
            return try {
                result.success(contentResolver.openInputStream(uri)?.use { it.readBytes() })
            } catch (e: Exception) {
                result.error("read", e.message, null)
            }
        }
        if (resultCode != Activity.RESULT_OK || uri == null || bytes == null) return result.success(false)
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
            result.success(true)
        } catch (e: Exception) {
            result.error("write", e.message, null)
        }
    }

    companion object {
        private const val SAVE_REQUEST = 4711
        private const val OPEN_REQUEST = 4712
        private const val NOTIFY_REQUEST = 4713
    }
}
