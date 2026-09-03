const scenarioList = document.getElementById('scenario-list');
const scenarioEditor = document.getElementById('scenario-editor');
const scenarioNameInput = document.getElementById('scenario-name');
const editorKind = document.getElementById('editor-kind');
const editorTitle = document.getElementById('editor-title');
const editorCrumb = document.getElementById('editor-crumb');
const suitePanel = document.getElementById('suite-panel');
const suiteSection = document.getElementById('suite-section');
const scenarioSection = document.getElementById('scenario-section');
const saveSuiteButton = document.getElementById('save-suite');
const suiteMemberCount = document.getElementById('suite-member-count');
const suiteDescription = document.getElementById('suite-description');
const suiteMembers = document.getElementById('suite-members');
const scenarioBuilder = document.getElementById('scenario-builder');
const addStepButton = document.getElementById('add-step');
const saveScenarioButton = document.getElementById('save-scenario');
const runTitle = document.getElementById('run-title');
const importScenarioButton = document.getElementById('import-scenario');
const importScenarioFileInput = document.getElementById('import-scenario-file');
const scenarioBaseUrl = document.getElementById('scenario-base-url');
const scenarioEnvironmentSelect = document.getElementById('scenario-environment');
const editRandomGeneratorsJsonButton = document.getElementById('edit-random-generators-json');
const editEnvironmentsJsonButton = document.getElementById('edit-environments-json');
const jsonDialog = document.getElementById('json-dialog');
const jsonDialogTitle = document.getElementById('json-dialog-title');
const jsonDialogEditor = document.getElementById('json-dialog-editor');
const jsonDialogCancelButton = document.getElementById('json-dialog-cancel');
const jsonDialogCancelTopButton = document.getElementById('json-dialog-cancel-top');
const jsonDialogSaveButton = document.getElementById('json-dialog-save');
const stepSequence = document.getElementById('step-sequence');
const stepCount = document.getElementById('step-count');
const selectedStepLabel = document.getElementById('selected-step-label');
const stepDetailEmpty = document.getElementById('step-detail-empty');
const stepDetailForm = document.getElementById('step-detail-form');
const stepNameInput = document.getElementById('step-name');
const stepMethodInput = document.getElementById('step-method');
const stepPathInput = document.getElementById('step-path');
const stepPathResolved = document.getElementById('step-path-resolved');
const stepTimeoutInput = document.getElementById('step-timeout');
const stepExpectedStatusInput = document.getElementById('step-expected-status');
const stepSaveResponseAsInput = document.getElementById('step-save-response-as');
const editStepHeadersJsonButton = document.getElementById('edit-step-headers-json');
const editStepJsonButton = document.getElementById('edit-step-json');
const editStepSaveJsonButton = document.getElementById('edit-step-save-json');
const editStepExpectedJsonButton = document.getElementById('edit-step-expected-json');
const stepStopOnFailureInput = document.getElementById('step-stop-on-failure');
const stepMoveUpButton = document.getElementById('step-move-up');
const stepMoveDownButton = document.getElementById('step-move-down');
const stepDeleteButton = document.getElementById('step-delete');
const testStepButton = document.getElementById('test-step');
const testSequenceButton = document.getElementById('test-sequence');
const sequenceTestOutput = document.getElementById('sequence-test-output');
const stepCurlOutput = document.getElementById('step-curl');
const copyStepCurlButton = document.getElementById('copy-step-curl');
const regressionRunButton = document.getElementById('regression-run');
const scenarioBaseUrlWrap = document.getElementById('scenario-base-url-wrap');
const runTargetHint = document.getElementById('run-target-hint');
const THEME_STORAGE_KEY = 'lti.theme';
const THEME_DEFAULT = 'dark';
const ENV_OVERRIDE_STORAGE_KEY = 'lti.env.overrides';
const ENV_REMOVED_STORAGE_KEY = 'lti.env.removed';
const runSpinner = document.getElementById('run-spinner');
const runProgressWrap = document.getElementById('run-progress-wrap');
const runProgressBar = document.getElementById('run-progress-bar');
const runProgressTrack = document.getElementById('run-progress-bar-track');
const runProgressLabel = document.getElementById('run-progress-label');
const runProgressTime = document.getElementById('run-progress-time');
const stepTestOutput = document.getElementById('step-test-output');
const runOutput = document.getElementById('run-output');
const reportText = document.getElementById('report-text');
const reportSummary = document.getElementById('report-summary');
let selectedScenarioName = null;
let selectedFolderPath = '';
let activeSuitePath = '';
let activeSuiteMembers = [];
let activeSuiteDocument = null;
const LAST_OPEN_STORAGE_KEY = 'lti.last.open';
let scenarioTree = {type: 'dir', name: 'examples', path: '', children: []};
let expandedFolders = new Set();
let expandedSuites = new Set();
let didExpandAllFolders = false;
let currentScenario = null;
let selectedStepIndex = -1;
let draggedStepIndex = -1;
let currentJsonDialogTarget = null;
let lastStepContextVars = {};
let stepCurlTimer = null;
let stepCurlGeneration = 0;
let lastHydratedCurlKey = '';
let lastCopiedCurl = '';

async function api(path, options = {}) {
  const {headers: extraHeaders, cache: _ignoredCache, ...rest} = options;
  const method = String(rest.method || 'GET').toUpperCase();
  let url = path;
  if (method === 'GET') {
    url += `${path.includes('?') ? '&' : '?'}_=${Date.now()}`;
  }
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {'Content-Type': 'application/json', ...extraHeaders},
    ...rest,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function parentFolderPath(filePath) {
  const index = filePath.lastIndexOf('/');
  return index === -1 ? '' : filePath.slice(0, index);
}

function joinPath(...parts) {
  return parts.filter(Boolean).join('/').replaceAll(/\/+/g, '/');
}

function scenarioFileUrl(path) {
  return `/api/scenarios/file?path=${encodeURIComponent(path)}`;
}

function expandAncestorFolders(filePath) {
  const parts = filePath.split('/').filter(Boolean);
  let current = '';
  parts.slice(0, -1).forEach((part) => {
    current = joinPath(current, part);
    expandedFolders.add(current);
  });
}

function expandFolderPath(folderPath) {
  if (!folderPath) {
    return;
  }
  const parts = folderPath.split('/').filter(Boolean);
  let current = '';
  parts.forEach((part) => {
    current = joinPath(current, part);
    expandedFolders.add(current);
  });
}

function collectFolderPaths(nodes, into = new Set()) {
  for (const node of nodes || []) {
    if (node.type === 'dir') {
      into.add(node.path);
      collectFolderPaths(node.children, into);
    }
  }
  return into;
}

function isSuiteNode(node) {
  return Boolean(node && (node.kind === 'suite' || (node.member_count || 0) > 0));
}

function findFirstSuiteFile(nodes) {
  for (const node of nodes || []) {
    if (node.type === 'file' && isSuiteNode(node)) {
      return node;
    }
    if (node.type === 'dir') {
      const nested = findFirstSuiteFile(node.children);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function svgIcon(name) {
  if (name === 'chevron') {
    return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.2 3.2a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4A.75.75 0 0 1 6.2 11.2L9.4 8 6.2 4.8a.75.75 0 0 1 0-1.6z"/></svg>';
  }
  if (name === 'folder') {
    return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2.5 3.5A1.5 1.5 0 0 1 4 2h2.2c.4 0 .77.2 1 .53L8.2 4H12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 12 14H4A1.5 1.5 0 0 1 2.5 12.5v-9z"/></svg>';
  }
  if (name === 'suite') {
    return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 3.5h10v2H3v-2zm0 3.5h10v2H3V7zm0 3.5h10V13H3v-2z"/></svg>';
  }
  return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7A1.5 1.5 0 0 0 13 12.5V6.2c0-.4-.16-.78-.44-1.06l-2.7-2.7A1.5 1.5 0 0 0 8.8 2H4.5z"/></svg>';
}

function renderExplorer() {
  scenarioList.innerHTML = '';
  const nodes = scenarioTree?.children || [];
  if (nodes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'file-explorer-empty';
    empty.textContent = 'No suites yet. Save a suite.json in a folder to get started.';
    scenarioList.appendChild(empty);
    return;
  }
  renderTreeNodes(scenarioList, nodes, 0);
}

function renderTreeNodes(container, nodes, depth) {
  nodes.forEach((node) => {
    if (node.type === 'dir') {
      const expanded = expandedFolders.has(node.path);
      const row = document.createElement('div');
      row.className = `tree-row${node.path === selectedFolderPath ? ' folder-selected' : ''}`;
      row.style.paddingLeft = `${8 + depth * 14}px`;
      row.title = node.path || node.name;

      const chevron = document.createElement('button');
      chevron.type = 'button';
      chevron.className = 'tree-chevron';
      chevron.innerHTML = svgIcon('chevron');
      chevron.style.transform = expanded ? 'rotate(90deg)' : 'rotate(0deg)';
      chevron.setAttribute('aria-label', expanded ? 'Collapse folder' : 'Expand folder');
      chevron.addEventListener('click', (event) => {
        event.stopPropagation();
        if (expandedFolders.has(node.path)) {
          expandedFolders.delete(node.path);
        } else {
          expandedFolders.add(node.path);
        }
        renderExplorer();
      });

      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.innerHTML = svgIcon('folder');

      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = node.name;

      row.append(chevron, icon, label);
      row.addEventListener('click', () => {
        selectedFolderPath = node.path;
        expandedFolders.add(node.path);
        renderExplorer();
      });
      container.appendChild(row);

      if (expanded) {
        renderTreeNodes(container, node.children || [], depth + 1);
      }
      return;
    }

    if (!isSuiteNode(node)) {
      return;
    }
    const expanded = expandedSuites.has(node.path);
    const selected = node.path === selectedScenarioName || node.path === activeSuitePath;
    const row = document.createElement('div');
    row.className = `tree-row kind-suite${selected ? ' selected' : ''}`;
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.title = node.path;

    const chevron = document.createElement('button');
    chevron.type = 'button';
    chevron.className = 'tree-chevron';
    chevron.innerHTML = svgIcon('chevron');
    chevron.style.transform = expanded ? 'rotate(90deg)' : 'rotate(0deg)';
    chevron.setAttribute('aria-label', expanded ? 'Collapse suite' : 'Expand suite');
    chevron.addEventListener('click', (event) => {
      event.stopPropagation();
      if (expandedSuites.has(node.path)) {
        expandedSuites.delete(node.path);
      } else {
        expandedSuites.add(node.path);
      }
      renderExplorer();
    });

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.innerHTML = svgIcon('suite');

    const kind = document.createElement('span');
    kind.className = 'tree-kind';
    kind.textContent = 'Suite';

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = node.name;

    const meta = document.createElement('span');
    meta.className = 'tree-meta';
    const count = node.member_count ?? (node.members || []).length;
    meta.textContent = `${count}`;
    meta.title = `${count} scenario${count === 1 ? '' : 's'}`;

    row.append(chevron, icon, kind, label, meta);
    row.addEventListener('click', () => {
      expandedSuites.add(node.path);
      void openScenario(node);
    });
    container.appendChild(row);

    if (!expanded) {
      return;
    }
    const folder = parentFolderPath(node.path);
    (node.members || []).forEach((memberName) => {
      const memberPath = joinPath(folder, memberName);
      const memberRow = document.createElement('button');
      memberRow.type = 'button';
      memberRow.className = `tree-row kind-scenario${memberPath === selectedScenarioName ? ' selected' : ''}`;
      memberRow.style.paddingLeft = `${8 + (depth + 1) * 14 + 22}px`;
      memberRow.title = memberPath;

      const memberIcon = document.createElement('span');
      memberIcon.className = 'tree-icon';
      memberIcon.innerHTML = svgIcon('file');

      const memberKind = document.createElement('span');
      memberKind.className = 'tree-kind';
      memberKind.textContent = 'Scenario';

      const memberLabel = document.createElement('span');
      memberLabel.className = 'tree-label';
      memberLabel.textContent = fileLabel(memberName);

      memberRow.append(memberIcon, memberKind, memberLabel);
      memberRow.addEventListener('click', () => {
        void openSuiteMember(node, memberName);
      });
      container.appendChild(memberRow);
    });
  });
}

function createEmptyScenario() {
  return {
    base_url: '',
    environments: {},
    selected_environment: '',
    random_generators: {},
    steps: [],
  };
}

function createEmptyStep() {
  return {
    name: 'new_step',
    method: 'GET',
    path: '/health',
    expected_status: 200,
  };
}

function normalizeScenario(scenario) {
  const normalizedEnvironments = scenario?.environments && typeof scenario.environments === 'object' && !Array.isArray(scenario.environments)
    ? scenario.environments
    : {};
  const selectedEnvironment = typeof scenario?.selected_environment === 'string'
    ? scenario.selected_environment
    : '';

  return {
    ...createEmptyScenario(),
    ...scenario,
    environments: normalizedEnvironments,
    selected_environment: selectedEnvironment,
    random_generators: scenario?.random_generators || {},
    steps: Array.isArray(scenario?.steps) ? scenario.steps : [],
  };
}

function isDefinedValue(value) {
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');
}

function mergeDefined(higher, lower) {
  const merged = {...(lower || {})};
  Object.entries(higher || {}).forEach(([key, value]) => {
    if (!isDefinedValue(value)) {
      return;
    }
    const current = merged[key];
    if (
      value && typeof value === 'object' && !Array.isArray(value)
      && current && typeof current === 'object' && !Array.isArray(current)
    ) {
      merged[key] = mergeDefined(value, current);
      return;
    }
    merged[key] = value;
  });
  return merged;
}

function getChildEnvironments() {
  if (!currentScenario || typeof currentScenario.environments !== 'object' || Array.isArray(currentScenario.environments)) {
    return {};
  }
  return currentScenario.environments;
}

function getSuiteEnvironments() {
  const suiteEnvs = activeSuiteDocument?.environments;
  if (!suiteEnvs || typeof suiteEnvs !== 'object' || Array.isArray(suiteEnvs)) {
    return {};
  }
  return suiteEnvs;
}

function getScenarioEnvironments() {
  const suiteEnvs = getSuiteEnvironments();
  if (Object.keys(suiteEnvs).length > 0 && !isSuiteScenario(currentScenario)) {
    return suiteEnvs;
  }
  if (isSuiteScenario(currentScenario)) {
    return getChildEnvironments();
  }
  return Object.keys(suiteEnvs).length > 0 ? suiteEnvs : getChildEnvironments();
}

function getSelectedEnvironmentName() {
  if (!currentScenario) {
    return '';
  }
  const environments = getScenarioEnvironments();
  const suiteSelected = activeSuiteDocument?.selected_environment || '';
  const selected = currentScenario.selected_environment || suiteSelected || '';
  if (selected && environments[selected]) {
    return selected;
  }
  if (suiteSelected && environments[suiteSelected]) {
    return suiteSelected;
  }
  const names = Object.keys(environments);
  return names[0] || '';
}

const CONNECTION_ENV_KEYS = new Set(['server', 'base_url', 'baseUrl', 'url', 'mock_provider']);
const FORBIDDEN_API_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'host.docker.internal',
  'ip6-localhost',
  'ip6-loopback',
]);
const ROUTABLE_HOST_HELP = 'API hosts must be an IP or FQDN, not localhost';

function hostnameFromTarget(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  const parsed = parseRunUrl(text.includes('://') ? text : `http://${text}`);
  return (parsed?.host || '').toLowerCase();
}

function isForbiddenApiHost(host) {
  const name = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!name) {
    return false;
  }
  if (FORBIDDEN_API_HOSTS.has(name)) {
    return true;
  }
  return name.endsWith('.localhost');
}

function isForbiddenApiTarget(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const text = value.trim();
  if (!text || text.includes('{{')) {
    return false;
  }
  return isForbiddenApiHost(hostnameFromTarget(text));
}

function envPlaceholderPath(token) {
  const trimmed = String(token || '').trim();
  if (trimmed.startsWith('vars.') || trimmed.startsWith('random.') || trimmed.startsWith('meta.')) {
    return null;
  }
  if (trimmed.startsWith('env.')) {
    return trimmed.slice(4);
  }
  if (trimmed.startsWith('_.')) {
    return trimmed.slice(2);
  }
  return trimmed;
}

function valueHasEnvPlaceholders(value) {
  const matches = String(value).match(/\{\{\s*([^}]+)\s*\}\}/g) || [];
  return matches.some((match) => {
    const inner = match.replace(/^\{\{\s*|\s*\}\}$/g, '');
    return envPlaceholderPath(inner) != null;
  });
}

function expandEnvironmentValues(env, keys) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    return {};
  }
  let current = {...env};

  const expandString = (value) => value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, rawToken) => {
    const path = envPlaceholderPath(rawToken);
    if (path == null) {
      return match;
    }
    let resolved = lookupEnvPath(current, path);
    if (resolved == null && Object.prototype.hasOwnProperty.call(current, path)) {
      resolved = current[path];
    }
    if (resolved == null || resolved === '' || typeof resolved === 'object') {
      return match;
    }
    const text = String(resolved);
    if (valueHasEnvPlaceholders(text)) {
      return match;
    }
    return text;
  });

  const walk = (value) => {
    if (typeof value === 'string') {
      return expandString(value);
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value && typeof value === 'object') {
      const next = {};
      Object.entries(value).forEach(([key, item]) => {
        next[key] = walk(item);
      });
      return next;
    }
    return value;
  };

  for (let i = 0; i < 10; i += 1) {
    let next;
    if (keys && keys.size) {
      next = {...current};
      keys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(next, key)) {
          next[key] = walk(next[key]);
        }
      });
    } else {
      next = walk(current);
    }
    if (JSON.stringify(next) === JSON.stringify(current)) {
      break;
    }
    current = next;
  }
  return current;
}

function isConcreteEnvValue(value) {
  if (value == null) {
    return false;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    return Boolean(text) && !valueHasEnvPlaceholders(text);
  }
  if (typeof value === 'object') {
    return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
  }
  return true;
}

function collectEnvRefs(value, found = new Set()) {
  if (typeof value === 'string') {
    const pattern = /\{\{\s*([^}]+)\s*\}\}/g;
    let match = pattern.exec(value);
    while (match) {
      const path = envPlaceholderPath(match[1]);
      if (path) {
        found.add(path);
      }
      match = pattern.exec(value);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectEnvRefs(item, found));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectEnvRefs(item, found));
  }
  return found;
}

function getRawMergedEnvironment() {
  const selectedName = getSelectedEnvironmentName();
  if (!selectedName) {
    return {};
  }
  const higher = getSuiteEnvironments()[selectedName];
  const lower = getChildEnvironments()[selectedName];
  return mergeDefined(
    higher && typeof higher === 'object' ? higher : {},
    lower && typeof lower === 'object' ? lower : {},
  );
}

function setEnvPath(target, path, value) {
  const parts = String(path).split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function loadAllSessionEnvOverrides() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ENV_OVERRIDE_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getSessionEnvOverrides() {
  const all = loadAllSessionEnvOverrides();
  const scoped = all[getSelectedEnvironmentName() || '_'];
  return scoped && typeof scoped === 'object' && !Array.isArray(scoped) ? {...scoped} : {};
}

function saveSessionEnvOverrides(values) {
  const all = loadAllSessionEnvOverrides();
  const key = getSelectedEnvironmentName() || '_';
  const next = {};
  Object.entries(values || {}).forEach(([name, value]) => {
    if (String(value || '').trim()) {
      next[name] = String(value);
    }
  });
  if (Object.keys(next).length) {
    all[key] = next;
  } else {
    delete all[key];
  }
  try {
    sessionStorage.setItem(ENV_OVERRIDE_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage failures; values still apply for this page lifetime via the form.
  }
}

function setSessionEnvOverride(name, value) {
  const current = getSessionEnvOverrides();
  if (String(value || '').trim()) {
    current[name] = String(value);
  } else {
    delete current[name];
  }
  saveSessionEnvOverrides(current);
}

function clearSessionEnvOverrides() {
  saveSessionEnvOverrides({});
}

function applySessionEnvOverrides(env) {
  const next = {...(env || {})};
  Object.entries(getSessionEnvOverrides()).forEach(([key, value]) => {
    if (!isConcreteEnvValue(value)) {
      return;
    }
    if (key.includes('.')) {
      const current = lookupEnvPath(next, key);
      if (!isConcreteEnvValue(current) || isForbiddenApiTarget(current)) {
        setEnvPath(next, key, value);
      }
      return;
    }
    const current = next[key];
    if (!isConcreteEnvValue(current) || (CONNECTION_ENV_KEYS.has(key) && isForbiddenApiTarget(current))) {
      next[key] = value;
    }
  });
  return next;
}

function isAssignedEnvValue(value) {
  if (value == null) {
    return false;
  }
  if (typeof value === 'string') {
    return Boolean(value.trim());
  }
  if (typeof value === 'object') {
    return Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0;
  }
  return true;
}

function selectedEnvironmentBlock() {
  const name = getSelectedEnvironmentName();
  if (!name) {
    return {};
  }
  const suiteBlock = getSuiteEnvironments()[name];
  if (suiteBlock && typeof suiteBlock === 'object' && !Array.isArray(suiteBlock)) {
    return suiteBlock;
  }
  const childBlock = getChildEnvironments()[name];
  return childBlock && typeof childBlock === 'object' && !Array.isArray(childBlock) ? childBlock : {};
}

function environmentBlock(environments, name) {
  const block = environments && name ? environments[name] : null;
  return block && typeof block === 'object' && !Array.isArray(block) ? block : {};
}

function shouldPromptForEnvKey(key) {
  const name = String(key || '').trim();
  if (!name || name.endsWith('_encoded')) {
    return false;
  }
  return true;
}

function removedEnvStorageScope() {
  return `${activeSuitePath || selectedScenarioName || '_'}::${getSelectedEnvironmentName() || '_'}`;
}

function loadRemovedEnvKeys() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ENV_REMOVED_STORAGE_KEY) || '{}');
    const list = parsed && typeof parsed === 'object' ? parsed[removedEnvStorageScope()] : null;
    return Array.isArray(list)
      ? list.filter((key) => typeof key === 'string' && shouldPromptForEnvKey(key))
      : [];
  } catch {
    return [];
  }
}

function saveRemovedEnvKeys(keys) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ENV_REMOVED_STORAGE_KEY) || '{}');
    const all = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const unique = [...new Set((keys || []).filter((key) => shouldPromptForEnvKey(key)))];
    if (unique.length) {
      all[removedEnvStorageScope()] = unique;
    } else {
      delete all[removedEnvStorageScope()];
    }
    sessionStorage.setItem(ENV_REMOVED_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage failures; removed keys still apply for this page lifetime.
  }
}

function syncRemovedEnvKeys(previousEnvironments, nextEnvironments) {
  const name = getSelectedEnvironmentName();
  const previous = environmentBlock(previousEnvironments, name);
  const next = environmentBlock(nextEnvironments, name);
  const removed = new Set(loadRemovedEnvKeys());
  Object.keys(previous).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      removed.add(key);
    }
  });
  Object.keys(next).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      removed.delete(key);
    }
  });
  saveRemovedEnvKeys([...removed]);
}

function unsetEnvironmentKeys(applySession) {
  const fileBlock = selectedEnvironmentBlock();
  let env = getRawMergedEnvironment();
  if (applySession) {
    env = applyEncodedCompanions(expandEnvironmentValues(applySessionEnvOverrides(env)));
  }
  const keys = new Set([...Object.keys(fileBlock), ...loadRemovedEnvKeys()]);
  return [...keys].filter((key) => {
    if (!shouldPromptForEnvKey(key)) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(fileBlock, key) && !isAssignedEnvValue(fileBlock[key])) {
      return applySession ? !isConcreteEnvValue(env[key]) : true;
    }
    if (!Object.prototype.hasOwnProperty.call(fileBlock, key)) {
      return applySession ? !isConcreteEnvValue(env[key]) : true;
    }
    return false;
  }).sort();
}

function missingEnvDependencies(applySession) {
  let env = getRawMergedEnvironment();
  if (applySession) {
    env = applyEncodedCompanions(expandEnvironmentValues(applySessionEnvOverrides(env)));
  }
  const refs = collectEnvRefs(env);
  collectEnvRefs(currentScenario?.steps || [], refs);
  const present = applySession ? isConcreteEnvValue : isAssignedEnvValue;
  return [...refs].filter((path) => {
    let resolved = lookupEnvPath(env, path);
    if (resolved == null && Object.prototype.hasOwnProperty.call(env, path)) {
      resolved = env[path];
    }
    if (CONNECTION_ENV_KEYS.has(path)) {
      return !isConcreteEnvValue(resolved) || isForbiddenApiTarget(resolved);
    }
    return !present(resolved);
  }).sort();
}

function connectionKeysNeedingValues(env) {
  const refs = collectEnvRefs(env);
  collectEnvRefs(currentScenario?.steps || [], refs);
  const scenarioBase = (currentScenario?.base_url || '').trim();
  return [...CONNECTION_ENV_KEYS].filter((key) => {
    const exists = Object.prototype.hasOwnProperty.call(env, key);
    const referenced = refs.has(key);
    const fromScenarioBase = key === 'base_url' && Boolean(scenarioBase);
    if (!exists && !referenced && !fromScenarioBase) {
      return false;
    }
    const value = exists
      ? env[key]
      : (fromScenarioBase ? scenarioBase : undefined);
    if (!isAssignedEnvValue(value)) {
      return true;
    }
    if (typeof value === 'string' && valueHasEnvPlaceholders(value)) {
      return true;
    }
    return isForbiddenApiTarget(value);
  });
}

function loopbackConnectionKeys(applySession) {
  let env = getRawMergedEnvironment();
  if (applySession) {
    env = applyEncodedCompanions(expandEnvironmentValues(applySessionEnvOverrides(env)));
  }
  return connectionKeysNeedingValues(env);
}

function requiredEnvironmentNames() {
  return [...new Set([
    ...missingEnvDependencies(false),
    ...loopbackConnectionKeys(false),
    ...unsetEnvironmentKeys(false),
  ])].sort();
}

function unsatisfiedEnvironmentNames() {
  return [...new Set([
    ...missingEnvDependencies(true),
    ...loopbackConnectionKeys(true),
    ...unsetEnvironmentKeys(true),
  ])].sort();
}

function environmentOverridesPayload() {
  const overrides = {};
  Object.entries(getSessionEnvOverrides()).forEach(([key, value]) => {
    if (String(value || '').trim()) {
      overrides[key] = String(value).trim();
    }
  });
  return overrides;
}

let lastRequiredEnvNames = '';
let runInProgress = false;

function renderRequiredEnvPanel() {
  const wrap = document.getElementById('session-env-wrap');
  const fields = document.getElementById('session-env-fields');
  const hint = document.getElementById('session-env-run-hint');
  const empty = document.getElementById('session-env-empty');
  if (!wrap || !fields) {
    return;
  }
  if (!hasSuiteContext()) {
    wrap.classList.add('hidden');
    fields.replaceChildren();
    lastRequiredEnvNames = '';
    return;
  }
  const names = requiredEnvironmentNames();
  const unsatisfied = unsatisfiedEnvironmentNames();
  const session = getSessionEnvOverrides();
  wrap.classList.remove('hidden');
  wrap.classList.toggle('is-unsatisfied', unsatisfied.length > 0);
  if (hint) {
    hint.classList.toggle('hidden', unsatisfied.length === 0);
  }
  if (empty) {
    empty.classList.toggle('hidden', names.length > 0);
  }
  const signature = names.join('\0');
  if (signature === lastRequiredEnvNames && fields.childElementCount === names.length) {
    names.forEach((name) => {
      const input = fields.querySelector(`[data-env-name="${name.replace(/"/g, '')}"]`);
      if (input && document.activeElement !== input) {
        input.value = session[name] || '';
      }
    });
    return;
  }
  lastRequiredEnvNames = signature;
  fields.replaceChildren();
  names.forEach((name) => {
    const label = document.createElement('label');
    label.append(document.createTextNode(name));
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.envName = name;
    input.value = session[name] || '';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = CONNECTION_ENV_KEYS.has(name)
      ? 'http://192.168.1.10:8080'
      : `Value for ${name}`;
    input.addEventListener('input', () => {
      setSessionEnvOverride(name, input.value);
      updateRunAvailability();
      lastHydratedCurlKey = '';
      scheduleStepCurlPreview();
    });
    label.appendChild(input);
    const fileValue = getRawMergedEnvironment()[name] ?? (name === 'base_url' ? currentScenario?.base_url : undefined);
    if (typeof fileValue === 'string' && fileValue.trim() && !session[name]) {
      const current = document.createElement('span');
      current.className = 'muted env-current-value';
      current.textContent = `Currently ${fileValue}`;
      label.appendChild(current);
    }
    fields.appendChild(label);
  });
}

function updateRunAvailability() {
  renderRequiredEnvPanel();
  const unsatisfied = unsatisfiedEnvironmentNames();
  const target = getRunTarget();
  const hostBlocked = Boolean(target.host) && isForbiddenApiHost(target.host);
  const blocked = runInProgress || unsatisfied.length > 0 || hostBlocked;
  if (regressionRunButton) {
    regressionRunButton.disabled = blocked;
    if (unsatisfied.length) {
      regressionRunButton.title = `Set required values: ${unsatisfied.join(', ')}`;
    } else if (hostBlocked) {
      regressionRunButton.title = ROUTABLE_HOST_HELP;
    } else {
      regressionRunButton.title = 'Run Tests';
    }
  }
}

function getSelectedEnvironmentValues() {
  const selectedName = getSelectedEnvironmentName();
  if (!selectedName) {
    return {};
  }
  let merged = applySessionEnvOverrides(getRawMergedEnvironment());
  merged = expandEnvironmentValues(merged, CONNECTION_ENV_KEYS);
  const resolvedHost = merged.server || merged.base_url || merged.baseUrl || merged.url
    || (currentScenario?.base_url || '').trim();
  if (resolvedHost) {
    merged.server = merged.server || resolvedHost;
    if (!merged.base_url) {
      merged.base_url = resolvedHost;
    }
  }
  return applyEncodedCompanions(expandEnvironmentValues(merged));
}

function applyEncodedCompanions(env) {
  const next = {...env};
  Object.keys(next).forEach((key) => {
    if (key.endsWith('_encoded')) {
      return;
    }
    const encodedKey = `${key}_encoded`;
    if (!Object.prototype.hasOwnProperty.call(next, encodedKey)) {
      return;
    }
    const value = next[key];
    if (typeof value !== 'string' || !value.trim() || valueHasEnvPlaceholders(value)) {
      return;
    }
    next[encodedKey] = encodeURIComponent(value);
  });
  return next;
}

function environmentValuesForDisplay() {
  return getSelectedEnvironmentValues();
}

function lookupEnvPath(env, token) {
  if (!token || !env || typeof env !== 'object') {
    return undefined;
  }
  return token.split('.').reduce((current, part) => {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    return current[part];
  }, env);
}

function expandEnvPlaceholders(value) {
  if (value == null) {
    return '';
  }
  if (typeof value !== 'string') {
    return expandEnvPlaceholders(JSON.stringify(value));
  }
  const env = environmentValuesForDisplay();
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, rawToken) => {
    const token = String(rawToken).trim();
    let path = token;
    if (token.startsWith('env.')) {
      path = token.slice(4);
    } else if (token.startsWith('_.')) {
      path = token.slice(2);
    } else if (token.startsWith('vars.') || token.startsWith('random.') || token.startsWith('meta.')) {
      return match;
    }
    let resolved = lookupEnvPath(env, path);
    if (resolved == null && Object.prototype.hasOwnProperty.call(env, token)) {
      resolved = env[token];
    }
    if (resolved == null || resolved === '') {
      return match;
    }
    return String(resolved);
  });
}

function stepDisplaySummary(step) {
  const method = String(step?.method || 'GET').toUpperCase();
  if (method === 'PREPARE') {
    return 'PREPARE';
  }
  if (method === 'SLEEP') {
    return `SLEEP ${step.seconds ?? 1}s`;
  }
  if (method === 'EXEC') {
    return expandEnvPlaceholders(step.command || step.exec || '');
  }
  return `${method} ${expandEnvPlaceholders(step.path || step.url || '/')}`;
}

function getResolvedBaseUrl() {
  const envValues = getSelectedEnvironmentValues();
  const candidate = envValues.server || envValues.base_url || envValues.baseUrl || envValues.url;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  return (currentScenario?.base_url || scenarioBaseUrl.value || '').trim();
}

function parseRunUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const scheme = parsed.protocol.replace(':', '') || 'http';
    const port = parsed.port
      ? Number(parsed.port)
      : (scheme === 'https' ? 443 : 80);
    return {scheme, host: parsed.hostname, port};
  } catch {
    return null;
  }
}

function viewingSuite() {
  return isSuiteScenario(currentScenario);
}

function getRunTarget() {
  const fromScenario = parseRunUrl(getResolvedBaseUrl() || '');
  return {
    scheme: fromScenario?.scheme || 'http',
    host: fromScenario?.host || '',
    port: fromScenario?.port || 8080,
  };
}

function updateRunTargetHint() {
  if (!runTargetHint) {
    return;
  }
  const target = getRunTarget();
  if (!target.host) {
    runTargetHint.textContent = 'Set server to an IP or FQDN (not localhost).';
    return;
  }
  if (isForbiddenApiHost(target.host)) {
    runTargetHint.textContent = ROUTABLE_HOST_HELP;
    return;
  }
  const url = `${target.scheme}://${target.host}:${target.port}`;
  if (viewingSuite()) {
    const envName = getSelectedEnvironmentName();
    if (!envName) {
      runTargetHint.textContent = 'Select a suite environment. Host and port come from that environment’s server URL.';
      return;
    }
    runTargetHint.textContent = `Using “${envName}” from the suite editor → ${url}`;
    return;
  }
  runTargetHint.textContent = `Requests go to ${url}.`;
}

function renderScenarioEnvironmentSelector() {
  const environments = getScenarioEnvironments();
  const names = Object.keys(environments);
  const selectedName = getSelectedEnvironmentName();

  scenarioEnvironmentSelect.innerHTML = '';

  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = names.length > 0 ? 'No environment override' : 'No environments available';
  scenarioEnvironmentSelect.appendChild(noneOption);

  names.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    scenarioEnvironmentSelect.appendChild(option);
  });

  scenarioEnvironmentSelect.value = selectedName;
  syncSuiteRunFields();
  updateRunTargetHint();
}

function syncSuiteRunFields() {
  const hasEnvironments = Object.keys(getScenarioEnvironments()).length > 0;
  if (scenarioBaseUrlWrap) {
    scenarioBaseUrlWrap.classList.toggle('hidden', hasEnvironments);
  }
}

function stringifyJson(value) {
  if (value === undefined) {
    return '';
  }
  return JSON.stringify(value, null, 2);
}

function parseOptionalJson(value, fieldName) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`${fieldName} must contain valid JSON`);
  }
}

function getValidatedScenarioPayload() {
  if (!currentScenario) {
    currentScenario = createEmptyScenario();
  }

  // Commit pending field edits bound to blur/change handlers.
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  let payload;
  try {
    payload = JSON.parse(JSON.stringify(currentScenario));
  } catch {
    throw new Error('Scenario contains non-serializable values. Please review JSON fields.');
  }

  if (!Array.isArray(payload.steps)) {
    throw new Error('Scenario JSON is invalid: steps must be an array.');
  }
  const suiteFile = Array.isArray(payload.scenarios) && payload.scenarios.length > 0 && payload.steps.length === 0;
  if (payload.environments != null && (typeof payload.environments !== 'object' || Array.isArray(payload.environments))) {
    throw new Error('Scenario JSON is invalid: environments must be a JSON object.');
  }
  if (payload.random_generators != null && (typeof payload.random_generators !== 'object' || Array.isArray(payload.random_generators))) {
    throw new Error('Scenario JSON is invalid: random_generators must be a JSON object.');
  }
  if (!suiteFile) {
    if (!payload.environments || Object.keys(payload.environments).length === 0) {
      delete payload.environments;
    }
    if (!payload.random_generators || Object.keys(payload.random_generators).length === 0) {
      delete payload.random_generators;
    }
    if (!String(payload.base_url || '').trim()) {
      delete payload.base_url;
    }
  }

  return payload;
}

function jsonValueIsSet(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return true;
}

function syncJsonFieldButton(button, value) {
  if (!button) {
    return;
  }
  const set = jsonValueIsSet(value);
  const label = button.dataset.label || 'JSON';
  button.classList.toggle('is-set', set);
  button.dataset.set = set ? 'true' : 'false';
  button.setAttribute('aria-label', set ? `Edit ${label}, values set` : `Edit ${label}`);
  button.title = set ? `${label} — values set` : `Edit ${label}`;
  const flag = button.querySelector('.json-field-flag');
  if (flag) {
    flag.hidden = !set;
  }
}

function formatExpectedStatus(value) {
  if (value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.join(',');
  }
  return String(value);
}

function parseExpectedStatus(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parts = trimmed.split(',').map((item) => Number(item.trim())).filter((item) => !Number.isNaN(item));
  if (parts.length === 0) {
    return undefined;
  }
  return parts.length === 1 ? parts[0] : parts;
}

function getSelectedStep() {
  if (!currentScenario || selectedStepIndex < 0 || selectedStepIndex >= currentScenario.steps.length) {
    return null;
  }
  return currentScenario.steps[selectedStepIndex];
}

function syncScenarioPreview() {
  if (!currentScenario) {
    scenarioEditor.value = '';
    return;
  }
  scenarioEditor.value = JSON.stringify(currentScenario, null, 2);
}

function renderStepSequence() {
  stepSequence.innerHTML = '';
  const steps = currentScenario?.steps || [];
  stepCount.textContent = `${steps.length} step${steps.length === 1 ? '' : 's'}`;
  if (testSequenceButton) {
    testSequenceButton.disabled = steps.length === 0;
  }

  steps.forEach((step, index) => {
    const card = document.createElement('div');
    card.className = `step-card${index === selectedStepIndex ? ' selected' : ''}`;
    card.draggable = true;

    card.addEventListener('dragstart', (event) => {
      draggedStepIndex = index;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    });

    card.addEventListener('dragend', () => {
      draggedStepIndex = -1;
      stepSequence.querySelectorAll('.step-card.drag-over').forEach((item) => {
        item.classList.remove('drag-over');
      });
      stepSequence.querySelectorAll('.step-card.dragging').forEach((item) => {
        item.classList.remove('dragging');
      });
    });

    card.addEventListener('dragover', (event) => {
      if (draggedStepIndex < 0 || draggedStepIndex === index) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', (event) => {
      event.preventDefault();
      card.classList.remove('drag-over');
      if (draggedStepIndex < 0 || draggedStepIndex === index) {
        return;
      }
      // Drop places the dragged step before the target tile.
      const targetIndex = draggedStepIndex < index ? index - 1 : index;
      moveStep(draggedStepIndex, targetIndex);
    });

    const body = document.createElement('button');
    body.className = 'step-card-body';
    body.type = 'button';
    body.innerHTML = `
      <span class="step-index">${index + 1}</span>
      <div class="step-copy">
        <strong>${escapeHtml(step.name || `step_${index + 1}`)}</strong>
        <span>${escapeHtml(stepDisplaySummary(step))}</span>
      </div>
    `;
    body.addEventListener('click', () => {
      selectedStepIndex = index;
      renderScenarioBuilder();
    });
    card.append(body);
    stepSequence.appendChild(card);
  });
}

function renderTestStepResult(result) {
  stepTestOutput.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
}

function renderStepDetail() {
  const step = getSelectedStep();
  if (!step) {
    stepDetailEmpty.classList.remove('hidden');
    stepDetailForm.classList.add('hidden');
    selectedStepLabel.textContent = 'none';
    stepMoveUpButton.disabled = true;
    stepMoveDownButton.disabled = true;
    stepDeleteButton.disabled = true;
    testStepButton.disabled = true;
    renderTestStepResult('No step selected.');
    renderStepCurl('Select a step to see curl.');
    return;
  }

  stepDetailEmpty.classList.add('hidden');
  stepDetailForm.classList.remove('hidden');
  selectedStepLabel.textContent = step.name || `step_${selectedStepIndex + 1}`;
  stepMoveUpButton.disabled = selectedStepIndex === 0;
  stepMoveDownButton.disabled = selectedStepIndex === currentScenario.steps.length - 1;
  stepDeleteButton.disabled = false;
  testStepButton.disabled = false;

  stepNameInput.value = step.name || '';
  stepMethodInput.value = step.method || 'GET';
  stepPathInput.value = step.path || '';
  if (stepPathResolved) {
    const resolved = expandEnvPlaceholders(step.path || step.url || '');
    const raw = step.path || step.url || '';
    stepPathResolved.textContent = resolved && resolved !== raw ? resolved : '';
  }
  stepTimeoutInput.value = step.timeout ?? '';
  stepExpectedStatusInput.value = formatExpectedStatus(step.expected_status);
  stepSaveResponseAsInput.value = step.save_response_as || '';
  syncJsonFieldButton(editStepHeadersJsonButton, step.headers);
  syncJsonFieldButton(editStepJsonButton, step.json);
  syncJsonFieldButton(editStepSaveJsonButton, step.save);
  syncJsonFieldButton(editStepExpectedJsonButton, step.expected_json_contains);
  stepStopOnFailureInput.checked = Boolean(step.stop_on_failure);
  scheduleStepCurlPreview();
}

function renderScenarioBuilder() {
  if (!currentScenario) {
    currentScenario = createEmptyScenario();
  }
  scenarioBaseUrl.value = currentScenario.base_url || '';
  renderScenarioEnvironmentSelector();
  renderHierarchy();
  renderStepSequence();
  renderStepDetail();
  syncScenarioPreview();
}

function getJsonDialogConfig(target) {
  if (target === 'environments') {
    const editingSuiteEnv = Boolean(isSuiteScenario(currentScenario) || (activeSuiteDocument && Object.keys(getSuiteEnvironments()).length > 0));
    return {
      title: editingSuiteEnv ? 'Edit Suite Environments JSON' : 'Edit Environments JSON',
      fieldName: 'Environments',
      currentValue: () => getScenarioEnvironments(),
      apply: (parsed) => {
        const previous = getScenarioEnvironments();
        const next = parsed || {};
        syncRemovedEnvKeys(previous, next);
        if (isSuiteScenario(currentScenario) || !activeSuiteDocument) {
          currentScenario.environments = next;
        } else {
          activeSuiteDocument.environments = next;
        }
        const names = Object.keys(next);
        if (!names.includes(currentScenario.selected_environment || '')) {
          currentScenario.selected_environment = names[0] || '';
        }
        if (activeSuiteDocument && names.includes(currentScenario.selected_environment || '')) {
          activeSuiteDocument.selected_environment = currentScenario.selected_environment;
        }
      },
    };
  }
  if (target === 'random_generators') {
    const editingSuite = Boolean(isSuiteScenario(currentScenario) || activeSuiteDocument);
    return {
      title: editingSuite ? 'Edit Suite Constants JSON' : 'Edit Constants JSON',
      fieldName: 'Constants',
      currentValue: () => {
        if (isSuiteScenario(currentScenario) || !activeSuiteDocument) {
          return currentScenario?.random_generators || {};
        }
        return activeSuiteDocument.random_generators || {};
      },
      apply: (parsed) => {
        const next = parsed || {};
        if (isSuiteScenario(currentScenario) || !activeSuiteDocument) {
          currentScenario.random_generators = next;
        } else {
          activeSuiteDocument.random_generators = next;
        }
      },
    };
  }
  if (target === 'step_headers') {
    const step = getSelectedStep();
    if (!step) throw new Error('Select a step first.');
    return {
      title: 'Edit Step Headers JSON',
      fieldName: 'Headers',
      currentValue: () => step.headers || {},
      apply: (parsed) => {
        if (parsed === undefined) {
          delete step.headers;
          return;
        }
        step.headers = parsed;
      },
    };
  }
  if (target === 'step_json') {
    const step = getSelectedStep();
    if (!step) throw new Error('Select a step first.');
    return {
      title: 'Edit Step Request Body JSON',
      fieldName: 'Request JSON body',
      currentValue: () => step.json,
      apply: (parsed) => {
        if (parsed === undefined) {
          delete step.json;
          return;
        }
        step.json = parsed;
      },
    };
  }
  if (target === 'step_save') {
    const step = getSelectedStep();
    if (!step) throw new Error('Select a step first.');
    return {
      title: 'Edit Step Save Mapping JSON',
      fieldName: 'Save mapping',
      currentValue: () => step.save || {},
      apply: (parsed) => {
        if (parsed === undefined) {
          delete step.save;
          return;
        }
        step.save = parsed;
      },
    };
  }
  if (target === 'step_expected_json') {
    const step = getSelectedStep();
    if (!step) throw new Error('Select a step first.');
    return {
      title: 'Edit Step Expected JSON',
      fieldName: 'Expected JSON contains',
      currentValue: () => step.expected_json_contains,
      apply: (parsed) => {
        if (parsed === undefined) {
          delete step.expected_json_contains;
          return;
        }
        step.expected_json_contains = parsed;
      },
    };
  }
  throw new Error('Unknown JSON dialog target');
}

function closeJsonDialog() {
  currentJsonDialogTarget = null;
  jsonDialog.classList.add('hidden');
  jsonDialogEditor.setCustomValidity('');
}

async function saveScenarioIfNamed() {
  const name = scenarioNameInput.value.trim();
  if (!name || !currentScenario) {
    return;
  }
  const payload = getValidatedScenarioPayload();
  await api(scenarioFileUrl(name), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  currentScenario = payload;
  selectedScenarioName = name;
}

async function persistActiveSuiteDocument() {
  if (!activeSuitePath || !activeSuiteDocument || isSuiteScenario(currentScenario)) {
    return;
  }
  const suite = await api(scenarioFileUrl(activeSuitePath));
  if (!suite || typeof suite !== 'object') {
    return;
  }
  suite.environments = activeSuiteDocument.environments || {};
  suite.random_generators = activeSuiteDocument.random_generators || {};
  if (activeSuiteDocument.selected_environment) {
    suite.selected_environment = activeSuiteDocument.selected_environment;
  }
  await api(scenarioFileUrl(activeSuitePath), {
    method: 'POST',
    body: JSON.stringify(suite),
  });
}

function openJsonDialog(target) {
  if (!currentScenario) {
    currentScenario = createEmptyScenario();
  }
  let config;
  try {
    config = getJsonDialogConfig(target);
  } catch (error) {
    alert(error.message || String(error));
    return;
  }
  currentJsonDialogTarget = target;
  jsonDialogTitle.textContent = config.title;
  jsonDialogEditor.value = stringifyJson(config.currentValue());
  jsonDialog.classList.remove('hidden');
  jsonDialogEditor.focus();
}

async function saveJsonDialog() {
  if (!currentJsonDialogTarget) {
    return;
  }
  if (!currentScenario) {
    currentScenario = createEmptyScenario();
  }

  const config = getJsonDialogConfig(currentJsonDialogTarget);
  try {
    const parsed = parseOptionalJson(jsonDialogEditor.value, config.fieldName);
    config.apply(parsed);
    if (currentJsonDialogTarget === 'environments' || currentJsonDialogTarget === 'random_generators') {
      await persistActiveSuiteDocument();
    }
    await saveScenarioIfNamed();
    closeJsonDialog();
    renderScenarioBuilder();
    runOutput.textContent = `${config.fieldName} saved to scenario.`;
  } catch (error) {
    jsonDialogEditor.setCustomValidity(error.message);
    jsonDialogEditor.reportValidity();
  }
}

function moveStep(fromIndex, toIndex) {
  if (!currentScenario || toIndex < 0 || toIndex >= currentScenario.steps.length) {
    return;
  }
  const [step] = currentScenario.steps.splice(fromIndex, 1);
  currentScenario.steps.splice(toIndex, 0, step);
  selectedStepIndex = toIndex;
  renderScenarioBuilder();
}

function deleteStep(index) {
  if (!currentScenario) {
    return;
  }
  currentScenario.steps.splice(index, 1);
  if (currentScenario.steps.length === 0) {
    selectedStepIndex = -1;
  } else if (selectedStepIndex >= currentScenario.steps.length) {
    selectedStepIndex = currentScenario.steps.length - 1;
  }
  renderScenarioBuilder();
}

function addStep() {
  if (!currentScenario) {
    currentScenario = createEmptyScenario();
  }
  currentScenario.steps.push(createEmptyStep());
  selectedStepIndex = currentScenario.steps.length - 1;
  renderScenarioBuilder();
}

function bindStepField(element, updater) {
  element.addEventListener('input', () => {
    const step = getSelectedStep();
    if (!step) {
      return;
    }
    try {
      updater(step, element);
      renderScenarioBuilder();
    } catch (error) {
      element.setCustomValidity(error.message);
      element.reportValidity();
    }
  });
  element.addEventListener('change', () => element.setCustomValidity(''));
}

function bindScenarioField(element, updater) {
  element.addEventListener('input', () => {
    if (!currentScenario) {
      currentScenario = createEmptyScenario();
    }
    try {
      updater(currentScenario, element);
      syncScenarioPreview();
    } catch (error) {
      element.setCustomValidity(error.message);
      element.reportValidity();
    }
  });
  element.addEventListener('change', () => element.setCustomValidity(''));
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(str) {
  return str ? str.replace(ANSI_RE, '') : '';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function persistLastOpen() {
  try {
    sessionStorage.setItem(LAST_OPEN_STORAGE_KEY, JSON.stringify({
      scenario: selectedScenarioName || '',
      suite: activeSuitePath || '',
    }));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function restoreLastOpen() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(LAST_OPEN_STORAGE_KEY) || '{}');
    return {
      scenario: typeof parsed.scenario === 'string' ? parsed.scenario : '',
      suite: typeof parsed.suite === 'string' ? parsed.suite : '',
    };
  } catch {
    return {scenario: '', suite: ''};
  }
}

async function reopenScenarioFile(path, options = {}) {
  await openScenario({path, name: path.split('/').pop() || path}, options);
}

async function loadScenarios() {
  scenarioTree = await api('/api/scenarios');
  if (!didExpandAllFolders) {
    collectFolderPaths(scenarioTree.children).forEach((path) => expandedFolders.add(path));
    didExpandAllFolders = true;
  }
  renderExplorer();
  let openPath = selectedScenarioName;
  let suitePath = activeSuitePath;
  if (!openPath) {
    const last = restoreLastOpen();
    openPath = last.scenario;
    suitePath = last.suite;
  }
  if (openPath) {
    try {
      if (suitePath && suitePath !== openPath) {
        await reopenScenarioFile(suitePath);
        await reopenScenarioFile(openPath, {fromSuite: true});
        return;
      }
      await reopenScenarioFile(openPath);
      return;
    } catch {
      selectedScenarioName = null;
    }
  }
  const first = findFirstSuiteFile(scenarioTree.children);
  if (first) {
    expandedSuites.add(first.path);
    await openScenario(first);
  }
}

function isSuiteScenario(scenario) {
  return Array.isArray(scenario?.scenarios) && scenario.scenarios.length > 0 && (!Array.isArray(scenario.steps) || scenario.steps.length === 0);
}

function fileLabel(path) {
  const name = String(path || '').split('/').pop() || '';
  return name.replace(/\.json$/i, '') || name;
}

function captureActiveSuiteDocument(scenario) {
  if (!isSuiteScenario(scenario)) {
    return;
  }
  activeSuiteDocument = {
    environments: scenario.environments || {},
    random_generators: scenario.random_generators || {},
    selected_environment: scenario.selected_environment || '',
    base_url: scenario.base_url || '',
    description: scenario.description || '',
  };
}

function rememberSuiteContext(path, scenario, fromSuite) {
  if (isSuiteScenario(scenario)) {
    activeSuitePath = path;
    activeSuiteMembers = Array.isArray(scenario.scenarios) ? scenario.scenarios.slice() : [];
    captureActiveSuiteDocument(scenario);
    return;
  }
  if (fromSuite) {
    return;
  }
  const fileName = String(path || '').split('/').pop();
  const sameFolder = activeSuitePath && parentFolderPath(path) === parentFolderPath(activeSuitePath);
  if (!(sameFolder && activeSuiteMembers.includes(fileName))) {
    activeSuitePath = '';
    activeSuiteMembers = [];
    activeSuiteDocument = null;
  }
}

function hasSuiteContext() {
  return Boolean(activeSuitePath) || isSuiteScenario(currentScenario);
}

function renderHierarchy() {
  const viewingSuite = isSuiteScenario(currentScenario);
  const hasSuite = hasSuiteContext();
  if (editorKind) {
    editorKind.textContent = 'Suite';
    editorKind.className = 'kind-pill kind-suite';
  }
  if (editorTitle) {
    const suitePath = activeSuitePath || (viewingSuite ? selectedScenarioName : '');
    editorTitle.textContent = suitePath ? fileLabel(suitePath) : 'Suite';
  }
  if (runTitle) {
    runTitle.textContent = 'Run';
  }
  if (saveScenarioButton) {
    saveScenarioButton.textContent = 'Save Scenario';
  }
  if (addStepButton) {
    addStepButton.classList.toggle('hidden', viewingSuite);
  }
  if (editRandomGeneratorsJsonButton) {
    editRandomGeneratorsJsonButton.textContent = 'Edit Suite Constants';
  }
  if (editEnvironmentsJsonButton) {
    editEnvironmentsJsonButton.textContent = 'Edit Suite Environments';
  }
  if (viewingSuite) {
    captureActiveSuiteDocument(currentScenario);
  }
  syncSuiteRunFields();
  if (suiteSection) {
    suiteSection.classList.toggle('hidden', !hasSuite);
  }
  if (scenarioSection) {
    scenarioSection.classList.toggle('hidden', viewingSuite || !currentScenario);
  }
  if (scenarioBuilder) {
    scenarioBuilder.classList.toggle('hidden', viewingSuite);
  }
  if (suitePanel) {
    suitePanel.classList.toggle('hidden', !hasSuite);
  }
  renderBreadcrumb();
  if (hasSuite) {
    renderSuiteMembers();
  }
  updateRunAvailability();
}

function renderBreadcrumb() {
  if (!editorCrumb) {
    return;
  }
  editorCrumb.innerHTML = '';
  const path = selectedScenarioName || scenarioNameInput.value.trim();
  if (!path && !currentScenario) {
    editorCrumb.innerHTML = '<span class="muted">Select a suite first, then a scenario in that suite.</span>';
    return;
  }
  const parts = [];
  const folder = parentFolderPath(path);
  if (folder) {
    parts.push({label: folder.split('/').pop(), title: folder});
  }
  if (activeSuitePath && !isSuiteScenario(currentScenario)) {
    parts.push({
      label: fileLabel(activeSuitePath),
      title: 'Suite',
      kind: 'suite',
      action: () => {
        const node = {path: activeSuitePath, name: activeSuitePath.split('/').pop()};
        void openScenario(node);
      },
    });
  }
  if (path) {
    parts.push({
      label: fileLabel(path),
      title: isSuiteScenario(currentScenario) ? 'Suite' : 'Scenario',
      kind: isSuiteScenario(currentScenario) ? 'suite' : 'scenario',
      current: true,
    });
  }
  const step = getSelectedStep();
  if (step) {
    parts.push({
      label: `${selectedStepIndex + 1}. ${step.name || `step_${selectedStepIndex + 1}`}`,
      title: 'Step',
      kind: 'step',
      current: true,
    });
  }
  parts.forEach((part, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '›';
      editorCrumb.appendChild(sep);
    }
    if (part.action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'crumb';
      button.textContent = part.label;
      button.title = part.title || part.label;
      button.addEventListener('click', part.action);
      editorCrumb.appendChild(button);
    } else {
      const current = document.createElement('span');
      current.className = part.current ? 'crumb-current' : 'crumb';
      current.textContent = part.label;
      current.title = part.title || part.label;
      editorCrumb.appendChild(current);
    }
  });
}

function renderSuiteMembers() {
  if (!suiteMembers) {
    return;
  }
  suiteMembers.innerHTML = '';
  const viewingSuite = isSuiteScenario(currentScenario);
  const members = viewingSuite
    ? (Array.isArray(currentScenario?.scenarios) ? currentScenario.scenarios : [])
    : activeSuiteMembers.slice();
  if (suiteMemberCount) {
    suiteMemberCount.textContent = `${members.length} scenario${members.length === 1 ? '' : 's'}`;
  }
  if (suiteDescription) {
    const text = viewingSuite
      ? (currentScenario?.description || '')
      : (activeSuiteDocument?.description || '');
    suiteDescription.textContent = text || 'This suite runs the listed scenarios in order.';
  }
  const folder = parentFolderPath((viewingSuite ? selectedScenarioName : activeSuitePath) || '');
  members.forEach((name, index) => {
    const fileName = String(name);
    const memberPath = joinPath(folder, fileName);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `suite-member${memberPath === selectedScenarioName ? ' is-current' : ''}`;
    button.innerHTML = `<span>${index + 1}. ${escapeHtml(fileLabel(fileName))}</span><span class="tree-kind">Scenario</span>`;
    button.addEventListener('click', () => {
      void openScenario({path: memberPath, name: fileName}, {fromSuite: true});
    });
    suiteMembers.appendChild(button);
  });
}

async function openSuiteMember(suiteNode, memberName) {
  if (!suiteNode?.path || !memberName) {
    return;
  }
  expandedSuites.add(suiteNode.path);
  if (activeSuitePath !== suiteNode.path || !activeSuiteDocument) {
    await openScenario(suiteNode);
  }
  const memberPath = joinPath(parentFolderPath(suiteNode.path), memberName);
  await openScenario({path: memberPath, name: memberName}, {fromSuite: true});
}

async function openScenario(item, options = {}) {
  const scenario = await api(scenarioFileUrl(item.path));
  selectedScenarioName = item.path;
  selectedFolderPath = parentFolderPath(item.path);
  expandAncestorFolders(item.path);
  scenarioNameInput.value = item.path;
  currentScenario = normalizeScenario(scenario);
  if (Array.isArray(scenario?.scenarios)) {
    currentScenario.scenarios = scenario.scenarios;
  }
  lastStepContextVars = {};
  lastHydratedCurlKey = '';
  selectedStepIndex = currentScenario.steps.length > 0 ? 0 : -1;
  rememberSuiteContext(item.path, currentScenario, Boolean(options?.fromSuite));
  if (isSuiteScenario(currentScenario)) {
    expandedSuites.add(item.path);
  } else if (activeSuitePath) {
    expandedSuites.add(activeSuitePath);
  }
  if (!isSuiteScenario(currentScenario) && !options.fromSuite) {
    try {
      const inherited = await api(`/api/scenarios/parent-suite?path=${encodeURIComponent(item.path)}`);
      if (inherited?.status === 'ok' && inherited.environments) {
        activeSuitePath = inherited.path || '';
        activeSuiteMembers = Array.isArray(inherited.scenarios) ? inherited.scenarios : [];
        activeSuiteDocument = {
          environments: inherited.environments || {},
          random_generators: inherited.random_generators || {},
          selected_environment: inherited.selected_environment || '',
          base_url: inherited.base_url || '',
          description: inherited.description || '',
        };
      }
    } catch {
      // Scenario can still open without a parent suite.
    }
  }
  persistLastOpen();
  renderExplorer();
  renderScenarioBuilder();
}

async function saveSuite() {
  try {
    if (isSuiteScenario(currentScenario)) {
      const name = activeSuitePath || selectedScenarioName;
      if (!name) {
        alert('Open a suite first');
        return;
      }
      const parsed = getValidatedScenarioPayload();
      await api(scenarioFileUrl(name), {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      currentScenario = parsed;
      selectedScenarioName = name;
      selectedFolderPath = parentFolderPath(name);
      captureActiveSuiteDocument(currentScenario);
      await loadScenarios();
      if (runOutput) {
        runOutput.textContent = 'Suite saved.';
      }
      return;
    }
    await persistActiveSuiteDocument();
    if (runOutput) {
      runOutput.textContent = 'Suite saved.';
    }
  } catch (error) {
    alert(error.message || String(error));
  }
}

async function saveScenario() {
  const name = scenarioNameInput.value.trim();
  if (!name) {
    alert('Scenario name is required');
    return;
  }
  try {
    const parsed = getValidatedScenarioPayload();
    await api(scenarioFileUrl(name), {
      method: 'POST',
      body: JSON.stringify(parsed),
    });
    currentScenario = parsed;
    selectedScenarioName = name;
    selectedFolderPath = parentFolderPath(name);
    expandAncestorFolders(name);
    await loadScenarios();
    renderExplorer();
    runOutput.textContent = 'Scenario saved.';
  } catch (error) {
    alert(error.message || String(error));
  }
}

function startNewScenario() {
  const prefix = selectedFolderPath ? `${selectedFolderPath}/` : '';
  selectedScenarioName = null;
  scenarioNameInput.value = `${prefix}new_scenario.json`;
  currentScenario = createEmptyScenario();
  lastStepContextVars = {};
  lastHydratedCurlKey = '';
  activeSuitePath = '';
  activeSuiteMembers = [];
  activeSuiteDocument = null;
  selectedStepIndex = -1;
  renderExplorer();
  renderScenarioBuilder();
}

async function createFolder() {
  const name = window.prompt('Folder name');
  if (!name || !name.trim()) {
    return;
  }
  const path = joinPath(selectedFolderPath, name.trim());
  try {
    const result = await api('/api/scenarios/folders', {
      method: 'POST',
      body: JSON.stringify({path}),
    });
    selectedFolderPath = result.path;
    expandFolderPath(result.path);
    await loadScenarios();
    renderExplorer();
  } catch (error) {
    alert(error.message || String(error));
  }
}

async function importScenarioFromFile(file) {
  if (!file) {
    return;
  }

  const form = new FormData();
  form.append('file', file);

  const desiredName = scenarioNameInput.value.trim();
  if (desiredName) {
    form.append('scenario_name', desiredName);
  }

  importScenarioButton.disabled = true;
  runOutput.textContent = 'Importing scenario...';

  try {
    const response = await fetch('/api/scenarios/import/file', {
      method: 'POST',
      body: form,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Import failed: ${response.status}`);
    }

    const result = await response.json();
    scenarioNameInput.value = result.name;
    selectedScenarioName = result.name;
    currentScenario = normalizeScenario(result.scenario || {});
    if (!currentScenario.selected_environment) {
      currentScenario.selected_environment = Object.keys(currentScenario.environments || {})[0] || '';
    }
    selectedStepIndex = currentScenario.steps.length > 0 ? 0 : -1;
    renderScenarioBuilder();
    await loadScenarios();
    runOutput.textContent = `Imported ${result.name} with ${result.step_count} steps.`;
  } catch (error) {
    runOutput.textContent = String(error);
  } finally {
    importScenarioButton.disabled = false;
    importScenarioFileInput.value = '';
  }
}

function scenarioTotalsPassed(totals) {
  const t = totals || {};
  return (t.failure || 0) === 0 && (t.expected_mismatch || 0) === 0 && (t.success || 0) > 0;
}

function firstStepError(steps) {
  const failed = (steps || []).find((step) => step.failure || step.expected_mismatch);
  if (!failed) {
    return '';
  }
  return failed.last_error || (failed.last_status != null ? `status ${failed.last_status}` : '');
}

function passFailRows(items) {
  return items.map((item) => {
    const ok = item.ok;
    const error = ok ? '' : (item.error || '');
    return `<tr class="${ok ? 'row-pass' : 'row-fail'}">
      <td>${escapeHtml(item.name || '')}</td>
      <td>${ok ? 'pass' : 'fail'}</td>
      <td>${escapeHtml(error)}</td>
    </tr>`;
  }).join('');
}

function renderPassFailList(summary) {
  const scenario = summary?.scenario;
  if (!scenario) {
    return '<p class="muted">No pass / fail results from this run.</p>';
  }
  const children = Array.isArray(scenario.scenarios) ? scenario.scenarios : null;
  if (children) {
    const rows = passFailRows(children.map((child) => ({
      name: child.name || child.file || '',
      ok: scenarioTotalsPassed(child.totals),
      error: firstStepError(child.steps),
    })));
    return `<table class="results-table">
      <thead><tr><th>Scenario</th><th>Result</th><th>Error</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
  const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
  if (!steps.length) {
    return '<p class="muted">No steps in this run.</p>';
  }
  const rows = passFailRows(steps.map((step) => ({
    name: step.name || '',
    ok: (step.failure || 0) === 0 && (step.expected_mismatch || 0) === 0,
    error: String(step.last_error || ''),
  })));
  return `<table class="results-table">
    <thead><tr><th>Step</th><th>Result</th><th>Error</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderLastRunResults(summary) {
  if (!reportText) {
    return;
  }
  const scenario = summary?.scenario || {};
  const totals = scenario.totals || {};
  const children = Array.isArray(scenario.scenarios) ? scenario.scenarios : null;
  if (reportSummary) {
    if (!summary || !scenario || (!children && !Array.isArray(scenario.steps))) {
      reportSummary.innerHTML = '';
    } else if (children) {
      const failed = totals.failed || 0;
      const passed = totals.passed ?? Math.max(children.length - failed, 0);
      reportSummary.innerHTML = [
        `<div class="metric-box"><span>Passed</span><strong>${passed}</strong></div>`,
        `<div class="metric-box${failed ? ' metric-fail' : ''}"><span>Failed</span><strong>${failed}</strong></div>`,
      ].join('');
    } else {
      const failed = (totals.failure || 0) + (totals.expected_mismatch || 0);
      const passed = (scenario.steps || []).filter((step) => (step.failure || 0) === 0 && (step.expected_mismatch || 0) === 0).length;
      reportSummary.innerHTML = [
        `<div class="metric-box"><span>Passed</span><strong>${passed}</strong></div>`,
        `<div class="metric-box${failed ? ' metric-fail' : ''}"><span>Failed</span><strong>${failed}</strong></div>`,
      ].join('');
    }
  }
  reportText.innerHTML = renderPassFailList(summary);
}

function renderSequenceTestResult(result) {
  if (!sequenceTestOutput) {
    return;
  }
  if (typeof result === 'string') {
    sequenceTestOutput.textContent = result;
    return;
  }
  const lines = [
    `${result.passed || 0} passed / ${result.failed || 0} failed  ${result.base_url || ''}`.trim(),
  ];
  for (const step of result.steps || []) {
    const mark = step.success ? 'PASS' : 'FAIL';
    const extra = step.success
      ? `${step.response_status ?? ''} ${step.latency_ms ?? ''}ms`.trim()
      : (step.error || `status ${step.response_status ?? '?'}`);
    lines.push(`${mark}  ${step.name || `step_${step.index + 1}`}  ${extra}`);
  }
  sequenceTestOutput.textContent = lines.join('\n');
}

function rememberStepContextVars(result) {
  const vars = result?.vars || result?.context?.vars;
  if (vars && typeof vars === 'object' && !Array.isArray(vars)) {
    lastStepContextVars = {...lastStepContextVars, ...vars};
  }
}

function renderStepCurl(text, canCopy = false) {
  if (stepCurlOutput) {
    stepCurlOutput.textContent = text;
  }
  if (copyStepCurlButton) {
    copyStepCurlButton.disabled = !canCopy;
    if (canCopy) {
      lastCopiedCurl = text;
      copyStepCurlButton.textContent = 'Copy';
    }
  }
}

function withActiveSuite(payload) {
  if (activeSuiteDocument) {
    payload.suite = activeSuiteDocument;
  }
  if (selectedScenarioName) {
    payload.scenario_file = `./examples/${selectedScenarioName}`;
  }
  return payload;
}

function stepCurlPayload(hydratePrior) {
  const target = getRunTarget();
  return withActiveSuite({
    scenario: currentScenario,
    step_index: selectedStepIndex,
    base_url: `${target.scheme}://${target.host}:${target.port}`,
    selected_environment: getSelectedEnvironmentName(),
    environment_overrides: environmentOverridesPayload(),
    context_vars: lastStepContextVars,
    hydrate_prior: hydratePrior,
  });
}

function stepCurlCacheKey() {
  const target = getRunTarget();
  const name = selectedScenarioName || currentScenario?.name || '';
  return `${name}|${selectedStepIndex}|${target.host}|${target.port}|${getSelectedEnvironmentName()}|${JSON.stringify(environmentOverridesPayload())}`;
}

function scheduleStepCurlPreview() {
  if (!stepCurlOutput) {
    return;
  }
  if (!currentScenario || selectedStepIndex < 0) {
    renderStepCurl('Select a step to see curl.');
    return;
  }
  window.clearTimeout(stepCurlTimer);
  stepCurlTimer = window.setTimeout(() => {
    void refreshStepCurl();
  }, 250);
}

async function refreshStepCurl() {
  if (!currentScenario || selectedStepIndex < 0) {
    renderStepCurl('Select a step to see curl.');
    return;
  }
  const generation = ++stepCurlGeneration;
  const cacheKey = stepCurlCacheKey();
  const hydratePrior = cacheKey !== lastHydratedCurlKey;
  renderStepCurl(hydratePrior ? 'Resolving placeholders…' : (stepCurlOutput.textContent || 'Expanding curl…'));
  try {
    const result = await api('/api/preview-step', {
      method: 'POST',
      body: JSON.stringify(stepCurlPayload(hydratePrior)),
    });
    if (generation !== stepCurlGeneration) {
      return;
    }
    rememberStepContextVars(result);
    lastHydratedCurlKey = cacheKey;
    const notes = (result.unresolved || []).length
      ? `\n\n# unresolved: ${(result.unresolved || []).join(', ')}`
      : '';
    renderStepCurl(`${result.curl || ''}${notes}`, Boolean(result.curl));
  } catch (error) {
    if (generation !== stepCurlGeneration) {
      return;
    }
    renderStepCurl(String(error));
  }
}

async function copyStepCurl() {
  const text = lastCopiedCurl || stepCurlOutput?.textContent || '';
  if (!text || !copyStepCurlButton) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    copyStepCurlButton.textContent = 'Copied';
    window.setTimeout(() => {
      if (copyStepCurlButton.textContent === 'Copied') {
        copyStepCurlButton.textContent = 'Copy';
      }
    }, 1200);
  } catch (error) {
    renderStepCurl(`${text}\n\n# copy failed: ${error}`);
  }
}

function sequenceTestPayload() {
  const target = getRunTarget();
  return withActiveSuite({
    scenario: currentScenario,
    base_url: `${target.scheme}://${target.host}:${target.port}`,
    selected_environment: getSelectedEnvironmentName(),
    environment_overrides: environmentOverridesPayload(),
  });
}

async function testAllSteps() {
  if (!currentScenario || !Array.isArray(currentScenario.steps) || currentScenario.steps.length === 0) {
    renderSequenceTestResult('Open a scenario with steps first.');
    return;
  }
  if (unsatisfiedEnvironmentNames().length) {
    renderSequenceTestResult('Set every required environment value before testing the sequence.');
    return;
  }
  if (testSequenceButton) {
    testSequenceButton.disabled = true;
  }
  renderSequenceTestResult('Running all steps...');
  try {
    const result = await api('/api/test-sequence', {
      method: 'POST',
      body: JSON.stringify(sequenceTestPayload()),
    });
    rememberStepContextVars(result);
    lastHydratedCurlKey = '';
    renderSequenceTestResult(result);
    scheduleStepCurlPreview();
  } catch (error) {
    renderSequenceTestResult(String(error));
  } finally {
    if (testSequenceButton) {
      testSequenceButton.disabled = !(currentScenario?.steps || []).length;
    }
  }
}

async function testSelectedStep() {
  if (!currentScenario || selectedStepIndex < 0) {
    renderTestStepResult('Select a step first.');
    return;
  }
  if (unsatisfiedEnvironmentNames().length) {
    renderTestStepResult('Set every required environment value before testing a step.');
    return;
  }
  const target = getRunTarget();
  testStepButton.disabled = true;
  renderTestStepResult('Testing selected step...');
  try {
    const result = await api('/api/test-step', {
      method: 'POST',
      body: JSON.stringify(withActiveSuite({
        scenario: currentScenario,
        step_index: selectedStepIndex,
        base_url: `${target.scheme}://${target.host}:${target.port}`,
        selected_environment: getSelectedEnvironmentName(),
        environment_overrides: environmentOverridesPayload(),
      })),
    });
    rememberStepContextVars(result);
    lastHydratedCurlKey = '';
    renderTestStepResult(result);
    scheduleStepCurlPreview();
  } catch (error) {
    renderTestStepResult(String(error));
  } finally {
    testStepButton.disabled = false;
  }
}

function setRunButtonsDisabled(disabled) {
  runInProgress = Boolean(disabled);
  updateRunAvailability();
}

async function startRun() {
  const runFile = activeSuitePath || selectedScenarioName || scenarioNameInput.value.trim();
  if (!runFile) {
    alert('Open a suite first');
    return;
  }

  if (unsatisfiedEnvironmentNames().length) {
    alert('Set every required environment value before running tests.');
    return;
  }

  if (!getSelectedEnvironmentName()) {
    alert('Select an environment on the suite.');
    return;
  }

  const {scheme, host, port: inferredPort} = getRunTarget();
  if (!host) {
    alert('Set server in the suite environment to an IP or FQDN.');
    return;
  }
  if (isForbiddenApiHost(host)) {
    alert(ROUTABLE_HOST_HELP);
    return;
  }

  const formLabel = document.getElementById('run-label').value.trim();
  const label = formLabel || 'regression';

  setRunButtonsDisabled(true);
  runSpinner.classList.remove('hidden');
  runOutput.textContent = 'Running tests…';

  let progressTimer = null;
  const startTime = Date.now();
  runProgressBar.style.transition = 'none';
  runProgressBar.style.width = '0%';
  runProgressTrack.setAttribute('aria-valuenow', 0);
  runProgressLabel.textContent = 'Running…';
  runProgressTime.textContent = '0 s';
  runProgressWrap.classList.remove('hidden');
  requestAnimationFrame(() => {
    runProgressBar.style.transition = 'width 0.8s linear';
  });
  progressTimer = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const elapsedRounded = Math.round(elapsed);
    runProgressBar.style.width = `${Math.min(elapsed * 4, 90).toFixed(1)}%`;
    runProgressTime.textContent = `${elapsedRounded} s`;
  }, 500);

  const payload = {
    scenario_file: `./examples/${runFile}`,
    scheme,
    host,
    port: inferredPort,
    scenario_users: 1,
    scenario_duration: 60,
    scenario_iterations: 1,
    scenario_environment: getSelectedEnvironmentName(),
    environment_overrides: environmentOverridesPayload(),
    label,
    regression: true,
  };
  let runFailed = false;
  try {
    const result = await api('/api/runs', {method: 'POST', body: JSON.stringify(payload)});
    const logText = stripAnsi(result.stdout || '').trim();
    runOutput.textContent = logText || 'Run completed.';
    renderLastRunResults(result.summary);
    if (result.status === 'completed_with_errors') {
      runFailed = true;
    }
  } catch (error) {
    runFailed = true;
    let msg = String(error);
    try {
      const inner = JSON.parse(msg.replace(/^Error:\s*/, ''));
      const detail = inner?.detail;
      if (detail?.summary) {
        renderLastRunResults(detail.summary);
      }
      if (detail?.stdout) msg = detail.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim();
      else if (typeof detail === 'string') msg = detail;
    } catch { /* use raw msg */ }
    runOutput.textContent = `Run failed:\n${msg}`;
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    runSpinner.classList.add('hidden');
    setRunButtonsDisabled(false);

    if (runFailed) {
      runProgressBar.style.transition = 'none';
      runProgressBar.classList.add('run-progress-bar--error');
      runProgressLabel.textContent = 'Failed';
    } else {
      runProgressBar.style.width = '100%';
      runProgressTrack.setAttribute('aria-valuenow', 100);
      runProgressLabel.textContent = 'Done';
    }
    setTimeout(() => {
      runProgressWrap.classList.add('hidden');
      runProgressBar.classList.remove('run-progress-bar--error');
    }, 3000);
  }
}

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : THEME_DEFAULT;
  } catch {
    return THEME_DEFAULT;
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) {
    return;
  }
  const next = theme === 'dark' ? 'light' : 'dark';
  toggle.setAttribute('aria-label', `Switch to ${next} mode`);
  toggle.title = `Switch to ${next} mode`;
}

function initTheme() {
  applyTheme(getStoredTheme());
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) {
    return;
  }
  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures and still apply the theme for this session.
    }
    applyTheme(next);
  });
}

initTheme();

document.getElementById('refresh-scenarios').addEventListener('click', loadScenarios);
document.getElementById('new-scenario').addEventListener('click', startNewScenario);
document.getElementById('new-folder').addEventListener('click', createFolder);
document.getElementById('save-scenario').addEventListener('click', saveScenario);
if (saveSuiteButton) {
  saveSuiteButton.addEventListener('click', () => {
    void saveSuite();
  });
}
importScenarioButton.addEventListener('click', () => importScenarioFileInput.click());
importScenarioFileInput.addEventListener('change', async () => {
  const [file] = importScenarioFileInput.files || [];
  await importScenarioFromFile(file);
});
if (regressionRunButton) {
  regressionRunButton.addEventListener('click', () => startRun());
}
document.getElementById('add-step').addEventListener('click', addStep);
stepMoveUpButton.addEventListener('click', () => moveStep(selectedStepIndex, selectedStepIndex - 1));
stepMoveDownButton.addEventListener('click', () => moveStep(selectedStepIndex, selectedStepIndex + 1));
stepDeleteButton.addEventListener('click', () => {
  if (selectedStepIndex < 0) {
    return;
  }
  if (window.confirm('Are you sure?')) {
    deleteStep(selectedStepIndex);
  }
});
testStepButton.addEventListener('click', testSelectedStep);
if (testSequenceButton) {
  testSequenceButton.addEventListener('click', testAllSteps);
}
if (copyStepCurlButton) {
  copyStepCurlButton.addEventListener('click', copyStepCurl);
}
document.getElementById('clear-session-env')?.addEventListener('click', () => {
  clearSessionEnvOverrides();
  lastRequiredEnvNames = '';
  updateRunAvailability();
  lastHydratedCurlKey = '';
  scheduleStepCurlPreview();
});

bindScenarioField(scenarioBaseUrl, (scenario, element) => {
  scenario.base_url = element.value.trim();
  updateRunTargetHint();
});

scenarioEnvironmentSelect.addEventListener('change', () => {
  if (!currentScenario) {
    currentScenario = createEmptyScenario();
  }
  currentScenario.selected_environment = scenarioEnvironmentSelect.value;
  if (activeSuiteDocument) {
    activeSuiteDocument.selected_environment = scenarioEnvironmentSelect.value;
  }
  lastHydratedCurlKey = '';
  lastStepContextVars = {};
  lastRequiredEnvNames = '';
  renderScenarioBuilder();
});


editRandomGeneratorsJsonButton.addEventListener('click', () => openJsonDialog('random_generators'));
editEnvironmentsJsonButton.addEventListener('click', () => openJsonDialog('environments'));
editStepHeadersJsonButton.addEventListener('click', () => openJsonDialog('step_headers'));
editStepJsonButton.addEventListener('click', () => openJsonDialog('step_json'));
editStepSaveJsonButton.addEventListener('click', () => openJsonDialog('step_save'));
editStepExpectedJsonButton.addEventListener('click', () => openJsonDialog('step_expected_json'));
jsonDialogCancelButton.addEventListener('click', closeJsonDialog);
jsonDialogCancelTopButton.addEventListener('click', closeJsonDialog);
jsonDialogSaveButton.addEventListener('click', saveJsonDialog);
jsonDialog.addEventListener('click', (event) => {
  if (event.target === jsonDialog || event.target.dataset.close === 'true') {
    closeJsonDialog();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !jsonDialog.classList.contains('hidden')) {
    closeJsonDialog();
  }
});

bindStepField(stepNameInput, (step, element) => {
  step.name = element.value;
});
bindStepField(stepMethodInput, (step, element) => {
  step.method = element.value;
});
bindStepField(stepPathInput, (step, element) => {
  step.path = element.value;
});
bindStepField(stepTimeoutInput, (step, element) => {
  if (!element.value) {
    delete step.timeout;
    return;
  }
  step.timeout = Number(element.value);
});
bindStepField(stepExpectedStatusInput, (step, element) => {
  const parsed = parseExpectedStatus(element.value);
  if (parsed === undefined) {
    delete step.expected_status;
    return;
  }
  step.expected_status = parsed;
});
bindStepField(stepSaveResponseAsInput, (step, element) => {
  if (!element.value.trim()) {
    delete step.save_response_as;
    return;
  }
  step.save_response_as = element.value.trim();
});
stepStopOnFailureInput.addEventListener('change', () => {
  const step = getSelectedStep();
  if (!step) {
    return;
  }
  if (stepStopOnFailureInput.checked) {
    step.stop_on_failure = true;
  } else {
    delete step.stop_on_failure;
  }
  renderScenarioBuilder();
});

loadScenarios();
updateRunAvailability();
