export { createPluginBroker, type PluginBroker, type PluginBrokerOptions } from './broker/broker.service.js';
export type {
  PluginChannel,
  PluginFaultHandler,
  PluginOperationHandler,
  PluginOperationRegistry,
} from './broker/broker.types.js';
export { createIframeSandboxChannel } from './sandbox/iframe-sandbox.js';
export { createSubtitleTemplateRegisterHandler } from './capabilities/subtitle-template.js';
