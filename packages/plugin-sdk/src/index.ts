/** Public, semver-governed VideoDip plugin contract. */
export {
  PLUGIN_API_VERSION,
  pluginCapabilitySchema,
  pluginManifestSchema,
  pluginSurfaceSchema,
  type PluginCapability,
  type PluginManifest,
  type PluginSurface,
} from './manifest.js';
export {
  hostPluginMessageSchema,
  pluginHostMessageSchema,
  pluginRequestSchema,
  type HostPluginMessage,
  type PluginContext,
  type PluginHostMessage,
  type PluginJson,
  type PluginRequest,
  type VideoDipPlugin,
} from './protocol.js';
export { authorizePluginRequest, createPluginGrant, type PluginGrant } from './authorization.js';
