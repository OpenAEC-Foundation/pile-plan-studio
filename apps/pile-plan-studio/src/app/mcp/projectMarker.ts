import { createProjectPersistenceSelector } from "../project/projectLifecycleController.ts";
import type { ProjectState } from "../../domain/project/projectState.ts";

export type ProjectMarkerValue = {
  project_instance_id: string;
  project_revision: number;
};

export type ProjectMarker = {
  observe: (state: ProjectState) => ProjectMarkerValue;
  reset: () => ProjectMarkerValue;
};

export function createProjectMarker(selectPersistence = createProjectPersistenceSelector()): ProjectMarker {
  let instanceId = crypto.randomUUID();
  let revision = 0;
  let signature: string | null = null;
  return {
    observe(state) {
      const nextSignature = selectPersistence(state).signature;
      if (signature !== nextSignature) {
        signature = nextSignature;
        revision += 1;
      }
      return { project_instance_id: instanceId, project_revision: revision };
    },
    reset() {
      instanceId = crypto.randomUUID();
      revision = 0;
      signature = null;
      return { project_instance_id: instanceId, project_revision: revision };
    },
  };
}
