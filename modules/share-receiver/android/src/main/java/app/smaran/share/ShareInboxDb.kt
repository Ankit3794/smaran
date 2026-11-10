// Reads and writes the share_inbox table in the app's own SQLite file (the one expo-sqlite opens as "smaran.db").
// First step of the data flow: share sheet -> ShareActivity -> share_inbox -> JS ingest (src/pipeline/ingest.ts) -> saves.
// Every function opens the database, does one small job and closes it, so the file is never held open by this screen.
package app.smaran.share

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File

// Copied verbatim from SHARE_INBOX_DDL in src/db/schema.ts. A share can arrive before the app has ever
// opened the database, so this side must be able to create the table itself.
private const val SHARE_INBOX_DDL = """CREATE TABLE IF NOT EXISTS share_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shared_text TEXT NOT NULL,
  source_app TEXT,
  note TEXT,
  received_at INTEGER NOT NULL,
  undone INTEGER NOT NULL DEFAULT 0,
  ingested INTEGER NOT NULL DEFAULT 0
)"""

// Mirrors extractFirstUrl in src/core/url.ts, so "already saved" compares the exact string ingest stores in saves.url.
// (?U) makes \S treat Unicode spaces as spaces, like JavaScript does.
private val FIRST_URL = Regex("""(?U)https?://\S+""")
private val TRAILING_PUNCTUATION = Regex("""[).,;:!?'"\]>]+$""")

private fun extractFirstUrl(text: String): String? =
    FIRST_URL.find(text)?.value?.replace(TRAILING_PUNCTUATION, "")

private fun openDatabase(context: Context): SQLiteDatabase {
  // expo-sqlite keeps its databases in files/SQLite/. That folder does not exist until the app first opens a database.
  val file = File(context.filesDir, "SQLite/smaran.db")
  file.parentFile?.mkdirs()
  val database = SQLiteDatabase.openDatabase(
      file.path,
      null,
      // NO_LOCALIZED_COLLATORS stops Android adding its own "android_metadata" table to the app's database.
      SQLiteDatabase.CREATE_IF_NECESSARY or SQLiteDatabase.NO_LOCALIZED_COLLATORS,
  )
  // WAL (write-ahead logging) lets this write go through while the app or its background task is reading the
  // same file; the JS side turns it on too (src/db/db.ts). Android also waits up to 2.5 s on a locked database.
  database.enableWriteAheadLogging()
  database.execSQL(SHARE_INBOX_DDL)
  return database
}

private fun tableExists(database: SQLiteDatabase, name: String): Boolean =
    database.rawQuery("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", arrayOf(name)).use { it.moveToFirst() }

/** Stores the share and returns its share_inbox id. Never touches the network, so it works offline. */
fun insertShare(context: Context, sharedText: String, sourceApp: String?): Long =
    openDatabase(context).use { database ->
      val values = ContentValues().apply {
        put("shared_text", sharedText)
        put("source_app", sourceApp)
        put("received_at", System.currentTimeMillis())
      }
      database.insertOrThrow("share_inbox", null, values)
    }

/** True when the first link in the text is already a save. Ingest will bump that save to today instead of duplicating it. */
fun isAlreadySaved(context: Context, sharedText: String): Boolean {
  val url = extractFirstUrl(sharedText) ?: return false
  return openDatabase(context).use { database ->
    // The saves table only exists once the app has opened the database at least once.
    tableExists(database, "saves") &&
        database.rawQuery("SELECT 1 FROM saves WHERE url = ? LIMIT 1", arrayOf(url)).use { it.moveToFirst() }
  }
}

/** Undo: ingest deletes undone rows, and their save if it was already created (see src/pipeline/ingest.ts). */
fun markUndone(context: Context, inboxId: Long) {
  openDatabase(context).use { database ->
    database.execSQL("UPDATE share_inbox SET undone = 1 WHERE id = ?", arrayOf(inboxId))
  }
}

/** Stores the note on the inbox row, and on the save too in case ingest already turned the row into a save. */
fun saveNote(context: Context, inboxId: Long, note: String) {
  openDatabase(context).use { database ->
    database.execSQL("UPDATE share_inbox SET note = ? WHERE id = ?", arrayOf<Any>(note, inboxId))
    if (tableExists(database, "saves")) {
      database.execSQL("UPDATE saves SET note = ? WHERE inbox_id = ?", arrayOf<Any>(note, inboxId))
    }
  }
}
