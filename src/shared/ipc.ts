export const IPC = {
  openDialog: 'file:open-dialog',
  openPath: 'file:open-path',
  takeStartupFile: 'app:take-startup-file',
  openFileFromMain: 'app:open-file',
  menuOpenFile: 'menu:open-file',
  openWorkspaceDialog: 'workspace:open-dialog',
  openWorkspace: 'workspace:open',
  getWorkspace: 'workspace:get',
  menuOpenFolder: 'menu:open-folder',
  setTheme: 'window:set-theme',
  syncPrefs: 'prefs:sync',
  menuSetReading: 'menu:set-reading',
  menuSetTheme: 'menu:set-theme',
  openExternal: 'shell:open-external',
  listDir: 'fs:list-dir'
} as const
