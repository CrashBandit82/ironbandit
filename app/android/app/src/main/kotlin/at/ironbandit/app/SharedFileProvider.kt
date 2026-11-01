package at.ironbandit.app

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

/**
 * Hands the file written by "shareFile" to the app the user shares with.
 * Not exported: the receiver only gets read access to the one shared URI
 * (FLAG_GRANT_READ_URI_PERMISSION). Serves only files in cache/share/.
 */
class SharedFileProvider : ContentProvider() {
    override fun onCreate() = true

    private fun fileFor(uri: Uri): File? {
        val dir = shareDir(context ?: return null)
        val name = uri.lastPathSegment ?: return null
        val file = File(dir, name)
        return if (file.parentFile == dir && file.isFile) file else null
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw SecurityException("read only")
        val file = fileFor(uri) ?: throw java.io.FileNotFoundException(uri.toString())
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? {
        val file = fileFor(uri) ?: return null
        val cols = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val row = cols.map {
            when (it) {
                OpenableColumns.DISPLAY_NAME -> file.name
                OpenableColumns.SIZE -> file.length()
                else -> null
            }
        }
        return MatrixCursor(cols, 1).apply { addRow(row) }
    }

    override fun getType(uri: Uri): String? = if (uri.lastPathSegment?.endsWith(".csv") == true) "text/csv" else null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0

    companion object {
        fun shareDir(context: Context) = File(context.cacheDir, "share")

        fun authority(context: Context) = "${context.packageName}.share"

        /** Writes [bytes] as [name] (old shared files are removed) and returns its URI. */
        fun write(context: Context, name: String, bytes: ByteArray): Uri {
            val dir = shareDir(context)
            dir.mkdirs()
            dir.listFiles()?.forEach { it.delete() }
            File(dir, name).writeBytes(bytes)
            return Uri.Builder().scheme("content").authority(authority(context)).appendPath(name).build()
        }
    }
}
