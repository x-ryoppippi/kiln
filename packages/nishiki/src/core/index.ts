import { register } from "./compile.ts";

register();

export {
  activeTable,
  compileEntry,
  compileInputs,
  configure,
  noticeMessage,
  type CompileContext,
  type Entry,
  type Notice,
  type Rule,
  type RuleInput,
} from "./compile.ts";
export {
  conditionsOf,
  createTable,
  rankOf,
  rankOfLayer,
  type Condition,
  type ConditionOptions,
  type Table,
} from "./conditions.ts";
export { layerName, layerOrder, setConditions } from "./config.ts";
export { compiled, extracted, resolve, type Compiled, type Resolved, type StyleInput } from "./resolve.ts";
export { entryOf, pack, unpack, type Packed } from "./rule.ts";
export { hash } from "./utils.ts";
