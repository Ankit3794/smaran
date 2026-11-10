// Checks that importing the background entry file registers both background triggers:
// the Headless JS task the native share activity starts, and the 15-minute periodic task.
// React Native's AppRegistry, the Expo task modules, the database and the queue runner are mocked.
import { AppRegistry } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { openDb } from '@/db/db';
import { runQueueNow } from '@/pipeline/runNow';

jest.mock('react-native', () => ({ AppRegistry: { registerHeadlessTask: jest.fn() } }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn().mockResolvedValue(undefined),
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));
jest.mock('@/db/db', () => ({ openDb: jest.fn().mockResolvedValue({ fake: 'db' }) }));
jest.mock('@/pipeline/runNow', () => ({ runQueueNow: jest.fn().mockResolvedValue({ processed: 0 }) }));

// Imported for its side effects, exactly like the app entry (index.ts) does.
require('@/pipeline/headless');

test('registers the SmaranProcess headless task, which runs the queue', async () => {
  const registerHeadlessTask = jest.mocked(AppRegistry.registerHeadlessTask);
  expect(registerHeadlessTask).toHaveBeenCalledWith('SmaranProcess', expect.any(Function));

  const taskProvider = registerHeadlessTask.mock.calls[0][1];
  await taskProvider()({});
  expect(openDb).toHaveBeenCalled();
  expect(runQueueNow).toHaveBeenCalledWith({ fake: 'db' });
});

test('defines and registers a periodic background task every 15 minutes', async () => {
  const defineTask = jest.mocked(TaskManager.defineTask);
  expect(defineTask).toHaveBeenCalledTimes(1);
  const [taskName, runTask] = defineTask.mock.calls[0];
  expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(taskName, { minimumInterval: 15 });

  jest.mocked(runQueueNow).mockClear();
  await expect(runTask({ data: {}, error: null, executionInfo: { eventId: '', taskName } })).resolves.toBe(BackgroundTask.BackgroundTaskResult.Success);
  expect(runQueueNow).toHaveBeenCalledTimes(1);
});
