import { browserRecentProjectKey } from "../../domain/project/browserRecentProjects.ts";
import { projectFileName } from "../../domain/project/projectPersistence.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";
import { projectDraftFromState } from "./projectLifecycleController.ts";

type Options = {
  state: ProjectState;
  recentKey: string | null;
  serialize: (draft: ReturnType<typeof projectDraftFromState>) => Promise<string>;
  remember: (key: string, name: string, contents: string) => Promise<void>;
  isCurrent: () => boolean;
  didSave: (key: string, signature: string) => void;
};

/** A replacement may proceed only after the captured project is durably stored. */
export async function saveBrowserProjectLocally(options: Options): Promise<boolean> {
  const draft = projectDraftFromState(options.state);
  const signature = JSON.stringify(draft);
  const name = projectFileName(options.state.name);
  const contents = await options.serialize(draft);
  const key = options.recentKey ?? await browserRecentProjectKey(name, contents);
  await options.remember(key, name, contents);
  if (!options.isCurrent()) return false;
  options.didSave(key, signature);
  return true;
}
