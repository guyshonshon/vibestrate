import {
  detectFullProject,
  type DetectedProject,
} from "../project/project-detector.js";
import {
  detectAllProviders,
  pickRecommendedProvider,
  type DetectedProvider,
  type ProviderDetectionRunner,
} from "../providers/provider-detection.js";
import { runInit, type InitOptions, type InitResult } from "../project/init-template.js";

export type SetupPlan = {
  project: DetectedProject;
  detections: DetectedProvider[];
  recommendedProvider: DetectedProvider | null;
  defaultProviderId: string;
  providerComplete: boolean;
  validationCommands: string[];
};

export async function planSetup(input: {
  projectRoot: string;
  detectionRunner?: ProviderDetectionRunner;
}): Promise<SetupPlan> {
  const project = await detectFullProject(input.projectRoot);
  const detections = await detectAllProviders(input.detectionRunner);
  const recommended = pickRecommendedProvider(detections);
  const defaultProviderId = recommended?.id ?? "claude";
  return {
    project,
    detections,
    recommendedProvider: recommended,
    defaultProviderId,
    providerComplete: !!recommended,
    validationCommands: project.suggestedValidationCommands,
  };
}

export type SetupResult = {
  plan: SetupPlan;
  init: InitResult;
};

export async function applySetup(input: {
  options: InitOptions;
  detectionRunner?: ProviderDetectionRunner;
}): Promise<SetupResult> {
  const plan = await planSetup({
    projectRoot: input.options.projectRoot,
    detectionRunner: input.detectionRunner,
  });
  const init = await runInit({
    projectRoot: input.options.projectRoot,
    force: input.options.force,
    plan,
  });
  return { plan, init };
}
