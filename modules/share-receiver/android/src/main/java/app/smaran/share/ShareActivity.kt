// The share target: Share -> Smaran in any app opens this small, see-through screen on top of that app.
// It writes the share to share_inbox (ShareInboxDb.kt), starts background processing (ProcessTaskService.kt),
// shows the confirmation card for 1.5 s and closes, so the user never leaves the app they were in.
// The manifest entry (translucent theme, intent filter, its own ":share" process) is added by plugin/withShareReceiver.js.
package app.smaran.share

import android.app.Activity
import android.content.Intent
import android.database.sqlite.SQLiteException
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

private const val CARD_VISIBLE_MS = 1500L
private const val REMOVED_VISIBLE_MS = 800L
private const val ERROR_VISIBLE_MS = 2000L

// Android requires an Activity subclass for anything shown on screen; the logic lives in small methods below.
class ShareActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private val finishLater = Runnable { finish() }

  // The share_inbox row this share became; null when nothing was saved (an image share).
  private var inboxId: Long? = null

  private lateinit var noteInput: EditText

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Android recreated this screen after killing the app mid-note: the share was saved the first time, so stop here.
    if (savedInstanceState != null) {
      finish()
      return
    }
    setContentView(R.layout.share_card)
    fitCardAboveSystemBarsAndKeyboard()
    noteInput = findViewById(R.id.share_note_input)

    // Tapping outside the card dismisses it early, unless the user is writing a note.
    findViewById<View>(R.id.share_root).setOnClickListener {
      if (noteInput.visibility != View.VISIBLE) finish()
    }

    val sharedText = readSharedText(intent)
    if (sharedText == null) {
      // Images and files carry no text to save; v1 only saves links and text.
      showMessage("Smaran saves links and text for now")
      hideButtons()
      handler.postDelayed(finishLater, CARD_VISIBLE_MS)
      return
    }

    val alreadySaved: Boolean
    try {
      alreadySaved = isAlreadySaved(this, sharedText)
      // On the main thread on purpose: it is one tiny local write, and it must be done before the card says "Saved".
      // referrer is the app the user shared from, e.g. "com.twitter.android".
      inboxId = insertShare(this, sharedText, referrer?.host)
    } catch (error: SQLiteException) {
      // A full disk, or the database stayed locked past Android's wait: say so instead of crashing over the other app.
      showErrorAndFinish("Couldn't save — try again")
      return
    }
    startBackgroundProcessing()
    if (alreadySaved) showMessage("Already saved, moved to today")

    findViewById<View>(R.id.share_undo).setOnClickListener { undo() }
    findViewById<View>(R.id.share_add_note).setOnClickListener { openNoteEditor() }
    findViewById<View>(R.id.share_save_note).setOnClickListener { saveNoteAndFinish() }
    handler.postDelayed(finishLater, CARD_VISIBLE_MS)
  }

  override fun onDestroy() {
    handler.removeCallbacks(finishLater)
    super.onDestroy()
  }

  private fun readSharedText(intent: Intent): String? {
    if (intent.action != Intent.ACTION_SEND) return null
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
    return text?.takeIf { it.isNotBlank() } ?: subject?.takeIf { it.isNotBlank() }
  }

  private fun startBackgroundProcessing() {
    try {
      startService(Intent(this, ProcessTaskService::class.java))
    } catch (error: IllegalStateException) {
      // Android can refuse to start background work; the share is already saved, and the periodic task
      // or the next app open will process it.
    }
  }

  private fun undo() {
    handler.removeCallbacks(finishLater)
    try {
      inboxId?.let { markUndone(this, it) }
    } catch (error: SQLiteException) {
      showErrorAndFinish("Couldn't undo — remove it in Smaran")
      return
    }
    // Run the queue again so ingest removes the row (and the save, if it was already created).
    startBackgroundProcessing()
    showMessage("Removed")
    hideButtons()
    handler.postDelayed(finishLater, REMOVED_VISIBLE_MS)
  }

  private fun openNoteEditor() {
    // The card stays open until the note is saved.
    handler.removeCallbacks(finishLater)
    hideButtons()
    noteInput.visibility = View.VISIBLE
    findViewById<View>(R.id.share_save_note).visibility = View.VISIBLE
    noteInput.requestFocus()
    // Posted so the keyboard opens after the field is laid out and focused.
    noteInput.post {
      getSystemService(InputMethodManager::class.java).showSoftInput(noteInput, 0)
    }
  }

  private fun saveNoteAndFinish() {
    val note = noteInput.text.toString().trim()
    val id = inboxId
    if (note.isNotEmpty() && id != null) {
      try {
        saveNote(this, id, note)
      } catch (error: SQLiteException) {
        showErrorAndFinish("Couldn't save the note — add it in Smaran")
        return
      }
      startBackgroundProcessing()
    }
    finish()
  }

  // Database failures end here: a short message on the card, then the card closes by itself.
  private fun showErrorAndFinish(title: String) {
    handler.removeCallbacks(finishLater)
    showMessage(title)
    hideButtons()
    getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(noteInput.windowToken, 0)
    noteInput.visibility = View.GONE
    findViewById<View>(R.id.share_save_note).visibility = View.GONE
    handler.postDelayed(finishLater, ERROR_VISIBLE_MS)
  }

  private fun showMessage(title: String) {
    findViewById<TextView>(R.id.share_title).text = title
    findViewById<View>(R.id.share_subtitle).visibility = View.GONE
  }

  private fun hideButtons() {
    findViewById<View>(R.id.share_buttons).visibility = View.GONE
  }

  private fun fitCardAboveSystemBarsAndKeyboard() {
    // Draw behind the status and navigation bars (Android 15+ forces this anyway), then pad the full-screen root
    // by the bars and the keyboard, so the card always sits just above whatever covers the bottom of the screen.
    WindowCompat.setDecorFitsSystemWindows(window, false)
    ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.share_root)) { view, insets ->
      val covered = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.setPadding(covered.left, covered.top, covered.right, covered.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }
}
