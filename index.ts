// App entry point (package.json "main"). Android may start the JS runtime with no screen at all,
// just to run a background task, so the background tasks are registered before the router loads.
import './src/pipeline/headless';
import 'expo-router/entry';
