import type { UIAdapterModule } from "../types";
import { parseOmniaStdoutLine, buildOmniaConfig } from "@paperclipai/adapter-omnia/ui";
import { SchemaConfigFields } from "../schema-config-fields";

export const omniaUIAdapter: UIAdapterModule = {
  type: "omnia",
  label: "OmnIA",
  parseStdoutLine: parseOmniaStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildOmniaConfig,
};
