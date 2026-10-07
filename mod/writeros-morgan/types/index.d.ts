export type Opened = boolean

declare module 'claude-code' {
  interface PluginState {
    'writeros-morgan': {
      opened: Opened
    }
  }
}
