const scenarioList = document.getElementById('scenario-list');
const runList = document.getElementById('run-list');
const scenarioEditor = document.getElementById('scenario-editor');
const scenarioNameInput = document.getElementById('scenario-name');
const editorKind = document.getElementById('editor-kind');
const editorTitle = document.getElementById('editor-title');
const editorCrumb = document.getElementById('editor-crumb');
const suitePanel = document.getElementById('suite-panel');
const suiteMemberCount = document.getElementById('suite-member-count');
const suiteDescription = document.getElementById('suite-description');
const suiteMembers = document.getElementById('suite-members');
const scenarioMeta = document.getElementById('scenario-meta');
const scenarioBuilder = document.getElementById('scenario-builder');
const addStepButton = document.getElementById('add-step');
const saveScenarioButton = document.getElementById('save-scenario');
const runTitle = document.getElementById('run-title');
const importScenarioButton = document.getElementById('import-scenario');
const importScenarioFileInput = document.getElementById('import-scenario-file');
const scenarioBaseUrl = document.getElementById('scenario-base-url');
const scenarioEnvironmentSelect = document.getElementById('scenario-environment');
const randomGeneratorsSummary = document.getElementById('random-generators-summary');
const editRandomGeneratorsJsonButton = document.getElementById('edit-random-generators-json');
const scenarioEnvironmentsSummary = document.getElementById('scenario-environments-summary');
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
const stepHeadersSummary = document.getElementById('step-headers-summary');
const stepJsonSummary = document.getElementById('step-json-summary');
const stepSaveSummary = document.getElementById('step-save-summary');
const stepExpectedJsonSummary = document.getElementById('step-expected-json-summary');
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
const runHostInput = document.getElementById('run-host');
const runPortInput = document.getElementById('run-port');
const runHostWrap = document.getElementById('run-host-wrap');
const runPortWrap = document.getElementById('run-port-wrap');
const scenarioBaseUrlWrap = document.getElementById('scenario-base-url-wrap');
const runTargetHint = document.getElementById('run-target-hint');
const RUN_HOST_STORAGE_KEY = 'lti.run.host';
const RUN_PORT_STORAGE_KEY = 'lti.run.port';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
let dockerRewriteHost = '';
let defaultTargetHost = '';
let defaultTargetPort = '';
const runSpinner = document.getElementById('run-spinner');
const runProgressWrap = document.getElementById('run-progress-wrap');
const runProgressBar = document.getElementById('run-progress-bar');
const runProgressTrack = document.getElementById('run-progress-bar-track');
const runProgressLabel = document.getElementById('run-progress-label');
const runProgressTime = document.getElementById('run-progress-time');
const reportProgressWrap = document.getElementById('report-progress-wrap');
const reportProgressBar = document.getElementById('report-progress-bar');
const reportProgressTrack = document.getElementById('report-progress-bar-track');
const reportProgressLabel = document.getElementById('report-progress-label');
const reportProgressTime = document.getElementById('report-progress-time');
const deleteRunButton = document.getElementById('delete-run');
const clearRunsButton = document.getElementById('clear-runs');
const stepTestOutput = document.getElementById('step-test-output');
const runOutput = document.getElementById('run-output');
const reportText = document.getElementById('report-text');
const reportSummary = document.getElementById('report-summary');
const artifactGallery = document.getElementById('artifact-gallery');
let selectedRunId = null;
let selectedScenarioName = null;
let selectedFolderPath = '';
let activeSuitePath = '';
let activeSuiteMembers = [];
let activeSuiteDocument = null;
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
  const response = await fetch(path, {
    headers: {'Content-Type': 'application/json'},
    ...options,
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

function renderList(container, items, onClick, format) {
  container.innerHTML = '';
  items.forEach((item) => {
    const button = document.createElement('button');
    button.className = 'list-item';
    button.textContent = format(item);
    button.addEventListener('click', () => onClick(item));
    container.appendChild(button);
  });
}

function createEmptyScenario() {
  return {
    base_url: 'http://localhost:8080',
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

function remapDisplayedServer(env) {
  const values = {...env};
  const raw = values.server || values.base_url || values.baseUrl || values.url;
  const parsed = parseRunUrl(raw || '');
  if (parsed && LOOPBACK_HOSTS.has(parsed.host) && defaultTargetHost) {
    values.server = `${parsed.scheme}://${defaultTargetHost}:${parsed.port}`;
  }
  return values;
}

function getSelectedEnvironmentValues() {
  const selectedName = getSelectedEnvironmentName();
  if (!selectedName) {
    return {};
  }
  const higher = getSuiteEnvironments()[selectedName];
  const lower = getChildEnvironments()[selectedName];
  return remapDisplayedServer(mergeDefined(
    higher && typeof higher === 'object' ? higher : {},
    lower && typeof lower === 'object' ? lower : {},
  ));
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
  const suiteMode = viewingSuite();
  const typedHost = suiteMode ? '' : (runHostInput?.value || '').trim();
  const scenarioHost = fromScenario?.host || '';
  let host = typedHost || scenarioHost || defaultTargetHost || 'localhost';
  if (!typedHost && LOOPBACK_HOSTS.has(host) && defaultTargetHost) {
    host = defaultTargetHost;
  }
  const portValue = suiteMode ? '' : (runPortInput?.value || '').trim();
  const port = portValue
    ? Number(portValue)
    : (fromScenario?.port || (defaultTargetPort ? Number(defaultTargetPort) : 8080));
  const scheme = fromScenario?.scheme || 'http';
  return {scheme, host, port};
}

function persistRunTarget() {
  if (!runHostInput || !runPortInput) {
    return;
  }
  const host = runHostInput.value.trim();
  const port = runPortInput.value.trim();
  if (host) {
    localStorage.setItem(RUN_HOST_STORAGE_KEY, host);
  }
  if (port) {
    localStorage.setItem(RUN_PORT_STORAGE_KEY, port);
  }
}

function restoreRunTarget() {
  if (!runHostInput || !runPortInput) {
    return;
  }
  const host = localStorage.getItem(RUN_HOST_STORAGE_KEY);
  const port = localStorage.getItem(RUN_PORT_STORAGE_KEY);
  if (host && !runHostInput.value.trim()) {
    runHostInput.value = host;
  }
  if (port && !runPortInput.value.trim()) {
    runPortInput.value = port;
  }
  updateRunTargetHint();
}

function updateRunTargetHint() {
  if (!runTargetHint) {
    return;
  }
  const target = getRunTarget();
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
  const loopback = LOOPBACK_HOSTS.has(target.host);
  if (dockerRewriteHost && loopback) {
    runTargetHint.textContent = `Docker would send localhost to ${dockerRewriteHost} (this Mac). Set Host to the VM, or leave it empty to use ${defaultTargetHost || 'LTI_TARGET_HOST'}.`;
    return;
  }
  runTargetHint.textContent = `Requests go to ${url} (same as CLI --host / --port).`;
}

async function loadRuntimeInfo() {
  try {
    const health = await api('/api/health');
    dockerRewriteHost = (health.rewrite_localhost || '').trim();
    defaultTargetHost = (health.target_host || '').trim();
    defaultTargetPort = (health.target_port || '').trim();
  } catch {
    dockerRewriteHost = '';
    defaultTargetHost = '';
    defaultTargetPort = '';
  }
  if (runHostInput && !runHostInput.value.trim() && defaultTargetHost) {
    runHostInput.placeholder = defaultTargetHost;
  }
  updateRunTargetHint();
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
  const suiteMode = viewingSuite();
  const hasEnvironments = Object.keys(getScenarioEnvironments()).length > 0;
  if (runHostWrap) {
    runHostWrap.classList.toggle('hidden', suiteMode);
  }
  if (runPortWrap) {
    runPortWrap.classList.toggle('hidden', suiteMode);
  }
  if (scenarioBaseUrlWrap) {
    scenarioBaseUrlWrap.classList.toggle('hidden', suiteMode || hasEnvironments);
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

function summarizeJsonObject(value, typeLabel) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `${typeLabel}: 0 entries`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return `${typeLabel}: 0 entries`;
  }
  return `${typeLabel}: ${keys.length} entr${keys.length === 1 ? 'y' : 'ies'} (${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''})`;
}

function summarizeJsonValue(value, typeLabel) {
  if (value === undefined) {
    return `${typeLabel}: empty`;
  }
  if (value === null) {
    return `${typeLabel}: null`;
  }
  if (Array.isArray(value)) {
    return `${typeLabel}: array (${value.length})`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `${typeLabel}: object (${keys.length} key${keys.length === 1 ? '' : 's'})`;
  }
  return `${typeLabel}: ${typeof value}`;
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
  stepHeadersSummary.value = summarizeJsonObject(step.headers || {}, 'Headers');
  stepJsonSummary.value = summarizeJsonValue(step.json, 'Request body');
  stepSaveSummary.value = summarizeJsonObject(step.save || {}, 'Save mapping');
  stepExpectedJsonSummary.value = summarizeJsonValue(step.expected_json_contains, 'Expected JSON');
  stepStopOnFailureInput.checked = Boolean(step.stop_on_failure);
  scheduleStepCurlPreview();
}

function renderScenarioBuilder() {
  if (!currentScenario) {
    currentScenario = createEmptyScenario();
  }
  scenarioBaseUrl.value = currentScenario.base_url || '';
  randomGeneratorsSummary.value = summarizeJsonObject(currentScenario.random_generators || {}, 'Constants');
  scenarioEnvironmentsSummary.value = summarizeJsonObject(currentScenario.environments || {}, 'Environments');
  renderScenarioEnvironmentSelector();
  renderHierarchy();
  renderStepSequence();
  renderStepDetail();
  syncScenarioPreview();
}

function getJsonDialogConfig(target) {
  if (target === 'environments') {
    return {
      title: 'Edit Environments JSON',
      fieldName: 'Environments',
      currentValue: () => currentScenario?.environments || {},
      apply: (parsed) => {
        currentScenario.environments = parsed || {};
        const names = Object.keys(currentScenario.environments || {});
        if (!names.includes(currentScenario.selected_environment || '')) {
          currentScenario.selected_environment = names[0] || '';
        }
      },
    };
  }
  if (target === 'random_generators') {
    return {
      title: 'Edit Constants JSON',
      fieldName: 'Constants',
      currentValue: () => currentScenario?.random_generators || {},
      apply: (parsed) => {
        currentScenario.random_generators = parsed || {};
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

function bindScenarioJsonField(element, updater) {
  const applyUpdate = () => {
    if (!currentScenario) {
      currentScenario = createEmptyScenario();
    }
    try {
      updater(currentScenario, element);
      element.setCustomValidity('');
      renderScenarioBuilder();
    } catch (error) {
      element.setCustomValidity(error.message);
      element.reportValidity();
    }
  };

  element.addEventListener('input', () => element.setCustomValidity(''));
  element.addEventListener('change', applyUpdate);
  element.addEventListener('blur', applyUpdate);
}

function bindStepJsonField(element, updater) {
  const applyUpdate = () => {
    const step = getSelectedStep();
    if (!step) {
      return;
    }
    try {
      updater(step, element);
      element.setCustomValidity('');
      renderScenarioBuilder();
    } catch (error) {
      element.setCustomValidity(error.message);
      element.reportValidity();
    }
  };

  element.addEventListener('input', () => element.setCustomValidity(''));
  element.addEventListener('change', applyUpdate);
  element.addEventListener('blur', applyUpdate);
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

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderMarkdown(markdown) {
  if (!markdown) {
    return '<p>No markdown report generated.</p>';
  }
  if (typeof marked !== 'undefined') {
    return marked.parse(markdown);
  }
  // Fallback: return as preformatted text if marked.js not loaded
  return `<pre>${escapeHtml(markdown)}</pre>`;
}

async function loadScenarios() {
  scenarioTree = await api('/api/scenarios');
  if (!didExpandAllFolders) {
    collectFolderPaths(scenarioTree.children).forEach((path) => expandedFolders.add(path));
    didExpandAllFolders = true;
  }
  renderExplorer();
  if (!selectedScenarioName) {
    const first = findFirstSuiteFile(scenarioTree.children);
    if (first) {
      expandedSuites.add(first.path);
      await openScenario(first);
    }
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

function renderHierarchy() {
  const viewingSuite = isSuiteScenario(currentScenario);
  const step = getSelectedStep();
  const kind = viewingSuite ? 'Suite' : 'Scenario';
  if (editorKind) {
    editorKind.textContent = kind;
    editorKind.className = `kind-pill ${viewingSuite ? 'kind-suite' : ''}`;
  }
  if (editorTitle) {
    editorTitle.textContent = viewingSuite ? 'Suite' : 'Scenario';
  }
  if (runTitle) {
    runTitle.textContent = viewingSuite ? 'Run Suite' : 'Run Scenario';
  }
  if (saveScenarioButton) {
    saveScenarioButton.textContent = viewingSuite ? 'Save Suite' : 'Save Scenario';
  }
  if (addStepButton) {
    addStepButton.classList.toggle('hidden', viewingSuite);
  }
  const suiteHint = document.getElementById('suite-globals-hint');
  if (suiteHint) {
    suiteHint.classList.toggle('hidden', !viewingSuite);
  }
  if (editRandomGeneratorsJsonButton) {
    editRandomGeneratorsJsonButton.textContent = viewingSuite ? 'Edit Suite Constants' : 'Edit Constants';
  }
  if (editEnvironmentsJsonButton) {
    editEnvironmentsJsonButton.textContent = viewingSuite ? 'Edit Suite Environments' : 'Edit Environments';
  }
  if (viewingSuite) {
    captureActiveSuiteDocument(currentScenario);
  }
  syncSuiteRunFields();
  if (scenarioBuilder) {
    scenarioBuilder.classList.toggle('hidden', viewingSuite);
  }
  if (suitePanel) {
    suitePanel.classList.toggle('hidden', !viewingSuite);
  }
  renderBreadcrumb();
  if (viewingSuite) {
    renderSuiteMembers();
  }
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
  const members = Array.isArray(currentScenario?.scenarios) ? currentScenario.scenarios : [];
  if (suiteMemberCount) {
    suiteMemberCount.textContent = `${members.length} scenario${members.length === 1 ? '' : 's'}`;
  }
  if (suiteDescription) {
    suiteDescription.textContent = currentScenario?.description || 'This suite runs the listed scenarios in order.';
  }
  const folder = parentFolderPath(selectedScenarioName || '');
  members.forEach((name, index) => {
    const fileName = String(name);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suite-member';
    button.innerHTML = `<span>${index + 1}. ${escapeHtml(fileLabel(fileName))}</span><span class="tree-kind">Scenario</span>`;
    button.addEventListener('click', () => {
      void openScenario({path: joinPath(folder, fileName), name: fileName}, {fromSuite: true});
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
        };
      }
    } catch {
      // Scenario can still open without a parent suite.
    }
  }
  renderExplorer();
  renderScenarioBuilder();
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

function renderRunList(runs) {
  runList.innerHTML = '';
  runs.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'list-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'list-item';
    if (item.id === selectedRunId) {
      button.classList.add('active');
    }
    button.textContent = `${item.id}${item.label ? ` - ${item.label}` : ''}`;
    button.addEventListener('click', () => openRun(item));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-button danger-subtle list-row-delete';
    del.title = 'Delete this run';
    del.setAttribute('aria-label', `Delete ${item.id}`);
    del.textContent = '×';
    del.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteRun(item.id);
    });
    row.appendChild(button);
    row.appendChild(del);
    runList.appendChild(row);
  });
  if (clearRunsButton) {
    clearRunsButton.disabled = runs.length === 0;
  }
}

async function loadRuns() {
  const runs = await api('/api/runs');
  if (selectedRunId && !runs.some((item) => item.id === selectedRunId)) {
    selectedRunId = null;
  }
  renderRunList(runs);
  deleteRunButton.disabled = !selectedRunId;
  if (!selectedRunId && runs.length > 0) {
    await openRun(runs[0]);
  } else if (runs.length === 0) {
    reportSummary.innerHTML = '';
    artifactGallery.innerHTML = '';
    reportText.innerHTML = renderMarkdown(null);
  }
}

function renderArtifacts(runId, artifacts) {
  artifactGallery.innerHTML = '';
  artifacts.filter((item) => item.name.endsWith('.png')).forEach((item) => {
    const wrapper = document.createElement('figure');
    wrapper.className = 'artifact';
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.name;
    const cap = document.createElement('figcaption');
    cap.textContent = item.name;
    wrapper.appendChild(img);
    wrapper.appendChild(cap);
    artifactGallery.appendChild(wrapper);
  });
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

function renderScenarioResults(summary) {
  const scenario = summary.scenario;
  if (!scenario) {
    return '';
  }
  const totals = scenario.totals || {};
  const children = Array.isArray(scenario.scenarios) ? scenario.scenarios : null;
  const rate = ((totals.success_rate || 0) * 100).toFixed(1);
  if (children) {
    const rows = children.map((child) => {
      const ct = child.totals || {};
      const ok = scenarioTotalsPassed(ct);
      const err = firstStepError(child.steps);
      return `<tr class="${ok ? 'row-pass' : 'row-fail'}">
        <td>${escapeHtml(child.name || child.file || '')}</td>
        <td>${ok ? 'pass' : 'fail'}</td>
        <td>${ct.success ?? 0}</td>
        <td>${ct.failure ?? 0}</td>
        <td>${escapeHtml(String(err || '—'))}</td>
      </tr>`;
    }).join('');
    return `<h2>Suite results</h2>
      <p>${totals.passed || 0} passed / ${totals.failed || 0} failed of ${totals.scenarios || children.length} scenarios (${rate}% step success)</p>
      <table class="results-table">
        <thead><tr><th>Scenario</th><th>Result</th><th>Success</th><th>Failure</th><th>First error</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    return '';
  }
  const rows = scenario.steps.map((step) => {
    const ok = (step.failure || 0) === 0 && (step.expected_mismatch || 0) === 0;
    return `<tr class="${ok ? 'row-pass' : 'row-fail'}">
      <td>${escapeHtml(step.name || '')}</td>
      <td>${escapeHtml(step.method || '')}</td>
      <td>${escapeHtml(step.path || '')}</td>
      <td>${step.success ?? 0}</td>
      <td>${step.failure ?? 0}</td>
      <td>${escapeHtml(String(step.last_error || '—'))}</td>
    </tr>`;
  }).join('');
  return `<h2>Scenario results</h2>
    <p>Success rate ${rate}% (${totals.success || 0} ok / ${totals.failure || 0} failed)</p>
    <table class="results-table">
      <thead><tr><th>Step</th><th>Method</th><th>Path</th><th>Success</th><th>Failure</th><th>Error</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function openRun(item) {
  selectedRunId = item.id;
  deleteRunButton.disabled = false;
  const data = await api(`/api/runs/${item.id}`);
  const summary = data.summary || {};
  const scenario = summary.scenario || {};
  const totals = scenario.totals || {};
  const isSuite = scenario.kind === 'suite' || Array.isArray(scenario.scenarios);
  const healthRps = summary.headline?.health_rps;
  const boxes = [
    `<div class="metric-box"><span>Label</span><strong>${escapeHtml(summary.label || item.id)}</strong></div>`,
    `<div class="metric-box"><span>Target</span><strong>${escapeHtml(summary.target || '-')}</strong></div>`,
  ];
  if (isSuite) {
    const failed = totals.failed || 0;
    boxes.push(`<div class="metric-box"><span>Passed</span><strong>${totals.passed ?? '-'}</strong></div>`);
    boxes.push(`<div class="metric-box${failed ? ' metric-fail' : ''}"><span>Failed</span><strong>${failed}</strong></div>`);
  } else if (Array.isArray(scenario.steps) && scenario.steps.length > 0) {
    const rate = ((totals.success_rate || 0) * 100).toFixed(1);
    boxes.push(`<div class="metric-box"><span>Success rate</span><strong>${rate}%</strong></div>`);
    boxes.push(`<div class="metric-box${totals.failure ? ' metric-fail' : ''}"><span>Failures</span><strong>${totals.failure ?? 0}</strong></div>`);
  }
  if (healthRps) {
    boxes.push(`<div class="metric-box"><span>Health RPS</span><strong>${healthRps}</strong></div>`);
    boxes.push(`<div class="metric-box"><span>Concurrent RPS</span><strong>${summary.headline?.concurrent_rps ?? '-'}</strong></div>`);
  }
  reportSummary.innerHTML = boxes.join('');
  const resultsHtml = renderScenarioResults(summary);
  const reportHtml = data.report ? renderMarkdown(data.report) : '';
  reportText.innerHTML = resultsHtml || reportHtml || '<p>No results yet.</p>';
  if (resultsHtml && reportHtml) {
    reportText.innerHTML = `${resultsHtml}<details><summary>Report</summary>${reportHtml}</details>`;
  }
  renderArtifacts(item.id, data.artifacts || []);
}

async function deleteRun(runId) {
  if (!runId) {
    return;
  }
  deleteRunButton.disabled = true;
  try {
    await api(`/api/runs/${runId}/delete`, {method: 'POST', body: JSON.stringify({})});
    if (selectedRunId === runId) {
      selectedRunId = null;
    }
    await loadRuns();
  } catch (error) {
    deleteRunButton.disabled = !selectedRunId;
    alert(String(error));
  }
}

async function deleteSelectedRun() {
  await deleteRun(selectedRunId);
}

async function clearAllRuns() {
  const runs = await api('/api/runs');
  if (!runs.length) {
    return;
  }
  if (!window.confirm(`Delete all ${runs.length} result folders?`)) {
    return;
  }
  if (clearRunsButton) {
    clearRunsButton.disabled = true;
  }
  try {
    await api('/api/runs/clear', {method: 'POST', body: JSON.stringify({})});
    selectedRunId = null;
    await loadRuns();
  } catch (error) {
    if (clearRunsButton) {
      clearRunsButton.disabled = false;
    }
    alert(String(error));
  }
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
    context_vars: lastStepContextVars,
    hydrate_prior: hydratePrior,
  });
}

function stepCurlCacheKey() {
  const target = getRunTarget();
  const name = selectedScenarioName || currentScenario?.name || '';
  return `${name}|${selectedStepIndex}|${target.host}|${target.port}|${getSelectedEnvironmentName()}`;
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
  });
}

async function testAllSteps() {
  if (!currentScenario || !Array.isArray(currentScenario.steps) || currentScenario.steps.length === 0) {
    renderSequenceTestResult('Open a scenario with steps first.');
    return;
  }
  const target = getRunTarget();
  if (dockerRewriteHost && LOOPBACK_HOSTS.has(target.host) && !defaultTargetHost) {
    renderSequenceTestResult(`Set Host to the authorization server IP. Docker rewrites localhost to ${dockerRewriteHost}.`);
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
  const target = getRunTarget();
  if (dockerRewriteHost && LOOPBACK_HOSTS.has(target.host)) {
    renderTestStepResult(`Host is localhost. In Docker that is rewritten to ${dockerRewriteHost}. Set Host to the machine where the API actually runs.`);
    return;
  }
  testStepButton.disabled = true;
  renderTestStepResult('Testing selected step...');
  try {
    const result = await api('/api/test-step', {
      method: 'POST',
      body: JSON.stringify(withActiveSuite({
        scenario: currentScenario,
        step_index: selectedStepIndex,
        base_url: `${getRunTarget().scheme}://${getRunTarget().host}:${getRunTarget().port}`,
        selected_environment: getSelectedEnvironmentName(),
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
  if (regressionRunButton) {
    regressionRunButton.disabled = disabled;
  }
}

async function startRun() {
  const scenarioName = scenarioNameInput.value.trim();
  if (!scenarioName) {
    alert('Open or save a scenario first');
    return;
  }

  const {scheme, host, port: inferredPort} = getRunTarget();
  if (viewingSuite()) {
    if (!getSelectedEnvironmentName()) {
      alert('Select an environment on the suite. Host and port come from that environment’s server URL.');
      return;
    }
  } else if (!host) {
    alert('Host is required. Set it in the Run Scenario form (same as CLI --host).');
    return;
  }
  if (!viewingSuite() && dockerRewriteHost && LOOPBACK_HOSTS.has(host) && !defaultTargetHost) {
    alert(`This UI runs in Docker and rewrites localhost to ${dockerRewriteHost} (this Mac). Set Host to the authorization server IP (same as CLI --host).`);
    return;
  }
  if (!viewingSuite()) {
    persistRunTarget();
  }

  const formLabel = document.getElementById('run-label').value.trim();
  const label = (!formLabel || formLabel === 'web_ui_run') ? 'regression' : formLabel;

  setRunButtonsDisabled(true);
  runSpinner.classList.remove('hidden');
  runOutput.textContent = 'Running tests…';

  let progressTimer = null;
  const startTime = Date.now();
  runProgressTrack.classList.remove('run-progress-track--overshoot');
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
    scenario_file: `./examples/${scenarioName}`,
    scheme,
    host,
    port: inferredPort,
    scenario_users: 1,
    scenario_duration: 60,
    scenario_iterations: 1,
    scenario_environment: getSelectedEnvironmentName(),
    scenario_secrets_file: document.getElementById('run-secrets-file').value.trim(),
    label,
    regression: true,
    generate_report: false,
  };
  let runFailed = false;
  try {
    const result = await api('/api/runs', {method: 'POST', body: JSON.stringify(payload)});
    const logText = stripAnsi(result.stdout || '').trim();
    runOutput.textContent = logText || 'Run completed. Select a run to review pass/fail results.';
    await loadRuns();
    if (result.run_id) {
      await openRun({id: result.run_id});
    }
  } catch (error) {
    runFailed = true;
    let msg = String(error);
    try {
      const inner = JSON.parse(msg.replace(/^Error:\s*/, ''));
      const detail = inner?.detail;
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
      runProgressTrack.classList.remove('run-progress-track--overshoot');
      runProgressBar.classList.remove('run-progress-bar--error');
      reportProgressWrap.classList.add('hidden');
    }, 3000);
  }
}

document.getElementById('refresh-scenarios').addEventListener('click', loadScenarios);
document.getElementById('new-scenario').addEventListener('click', startNewScenario);
document.getElementById('new-folder').addEventListener('click', createFolder);
document.getElementById('refresh-runs').addEventListener('click', loadRuns);
if (clearRunsButton) {
  clearRunsButton.addEventListener('click', clearAllRuns);
}
document.getElementById('save-scenario').addEventListener('click', saveScenario);
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
deleteRunButton.addEventListener('click', deleteSelectedRun);

bindScenarioField(scenarioBaseUrl, (scenario, element) => {
  scenario.base_url = element.value.trim();
  updateRunTargetHint();
});

scenarioEnvironmentSelect.addEventListener('change', () => {
  if (!currentScenario) {
    currentScenario = createEmptyScenario();
  }
  currentScenario.selected_environment = scenarioEnvironmentSelect.value;
  lastHydratedCurlKey = '';
  lastStepContextVars = {};
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
  if (event.target === jsonDialog) {
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
loadRuns();
loadRuntimeInfo();
restoreRunTarget();
if (runHostInput) {
  runHostInput.addEventListener('input', () => {
    persistRunTarget();
    updateRunTargetHint();
    lastHydratedCurlKey = '';
    scheduleStepCurlPreview();
  });
}
if (runPortInput) {
  runPortInput.addEventListener('input', () => {
    persistRunTarget();
    updateRunTargetHint();
    lastHydratedCurlKey = '';
    scheduleStepCurlPreview();
  });
}
