// Runs the "SmaranProcess" JS task (registered in src/pipeline/headless.ts) without opening any screen.
// ShareActivity starts this service right after it writes to share_inbox, so a share is summarised in the background.
// Headless JS is React Native's way to run app JavaScript from native code, even when the app was closed.
package app.smaran.share

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

// Android requires a Service subclass here; React Native's base class does the work of starting JS.
class ProcessTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
      HeadlessJsTaskConfig(
          "SmaranProcess",
          Arguments.createMap(),
          // The JS side stops itself after 25 s (src/pipeline/runNow.ts); this is the hard stop just after it.
          30_000,
          // Allowed while the app is open too: the share card itself is in the foreground when it starts us.
          true,
      )
}
