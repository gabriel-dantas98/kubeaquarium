import { isSubmarineModel, SUBMARINE_MODELS, type SubmarineModelId } from '../submarine';
import './vehicle.css';

/** Native selection keeps keyboard and assistive-technology support built in. */
export function mountVehicleSelector(container: HTMLElement, onChange: (model: SubmarineModelId) => void): void {
  const section = document.createElement('div');
  section.className = 'vehicle-settings';
  const label = document.createElement('label');
  label.htmlFor = 'submarine-model';
  label.textContent = 'YOUR SUBMARINE';
  const select = document.createElement('select');
  select.id = 'submarine-model';
  select.setAttribute('aria-describedby', 'submarine-description');
  for (const model of SUBMARINE_MODELS) {
    const option = document.createElement('option');
    option.value = model.id; option.textContent = model.name;
    select.append(option);
  }
  const description = document.createElement('p');
  description.id = 'submarine-description';
  description.setAttribute('aria-live', 'polite');
  const hint = document.createElement('small');
  hint.textContent = 'Dive to pilot your selected vessel. Same controls for every hull.';
  section.append(label, select, description, hint);
  container.prepend(section);
  let selected: SubmarineModelId = 'nautilus';
  try {
    const saved = localStorage.getItem('kubeaquarium.submarine');
    if (isSubmarineModel(saved)) selected = saved;
  } catch { /* Selection also works without browser storage. */ }
  function apply() {
    select.value = selected;
    const model = SUBMARINE_MODELS.find(model => model.id === selected)!;
    description.textContent = model.description;
    section.style.setProperty('--vessel-color', model.color);
    onChange(selected);
  }
  select.addEventListener('change', () => {
    if (!isSubmarineModel(select.value)) return;
    selected = select.value; apply();
    try { localStorage.setItem('kubeaquarium.submarine', selected); } catch { /* Selection stays usable. */ }
  });
  apply();
}
