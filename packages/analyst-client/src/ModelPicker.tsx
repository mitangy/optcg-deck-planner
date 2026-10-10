import { useEffect, useState } from "react";
import { getModelSetting, modelCostHint, modelLabel, setModelSetting, type ModelSetting } from "./modelSetting";

/** The model Log Pose runs on. Shown only to the model admin (the API says so with can_edit); everyone else sees nothing. */
export function ModelPicker({ apiBase }: { apiBase: string }) {
  const [setting, setSetting] = useState<ModelSetting | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getModelSetting(apiBase).then(
      (s) => live && setSetting(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [apiBase]);

  if (!setting?.canEdit) return null;

  const change = async (model: string) => {
    if (busy || model === setting.model) return;
    setBusy(true);
    setError(null);
    try {
      setSetting(await setModelSetting(apiBase, model));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lp-model">
      <label className="lp-model-row" htmlFor="lp-model-select">
        <span className="lp-model-label">Model</span>
        <select id="lp-model-select" className="lp-model-select" value={setting.model} disabled={busy} onChange={(e) => void change(e.target.value)}>
          {setting.options.map((o) => (
            <option key={o} value={o}>
              {modelLabel(o)}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="lp-model-note lp-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="lp-model-note">{[modelCostHint(setting.model), "This changes it for everyone."].filter(Boolean).join(" ")}</p>
      )}
    </div>
  );
}
