const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TOOLS_DIR = path.join(__dirname, 'tools');
const TOOL_TIMEOUT_MS = 5 * 60 * 1000;

function loadTools() {
  const tools = {};
  if (!fs.existsSync(TOOLS_DIR)) return tools;

  for (const entry of fs.readdirSync(TOOLS_DIR)) {
    const dir = path.join(TOOLS_DIR, entry);
    if (!fs.statSync(dir).isDirectory()) continue;

    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!manifest.name || !manifest.command) continue;

      let script = manifest.script;
      if (!script) {
        const files = fs.readdirSync(dir);
        const pyFile = files.find((f) => f.endsWith('.py'));
        const shFile = files.find((f) => f.endsWith('.sh'));
        script = pyFile || shFile;
        if (script) script = path.join(dir, script);
      } else {
        script = path.isAbsolute(script) ? script : path.join(dir, script);
      }

      tools[manifest.name] = {
        ...manifest,
        script,
        dir,
      };
    } catch (err) {
      console.warn(`[tools] 跳过 ${entry}: ${err.message}`);
    }
  }
  return tools;
}

function toolsToOpenAISchema(tools) {
  return Object.values(tools).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function renderTemplate(template, vars) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) return '';
    return String(vars[key] ?? '');
  });
}

function executeTool(tools, { toolName, args }) {
  return new Promise((resolve) => {
    const tool = tools[toolName];
    if (!tool) {
      return resolve({ ok: false, error: `未知工具: ${toolName}` });
    }

    const required = tool.parameters?.required || [];
    const missing = required.filter((key) => args[key] == null || args[key] === '');
    if (missing.length) {
      return resolve({ ok: false, error: `缺少必填参数: ${missing.join(', ')}` });
    }

    const renderVars = { script: tool.script, ...args };
    const cmdArgs = (tool.args || []).map((item) => renderTemplate(item, renderVars));
    if (tool.args_optional) {
      for (const [key, template] of Object.entries(tool.args_optional)) {
        if (args[key] != null && args[key] !== '') {
          cmdArgs.push(renderTemplate(template, renderVars));
        }
      }
    }
    if (tool.flags) {
      for (const [key, flag] of Object.entries(tool.flags)) {
        if (args[key] === true) cmdArgs.push(flag);
      }
    }

    const child = spawn(tool.command, cmdArgs, {
      cwd: tool.dir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf-8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8'); });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: '执行超时（>5min）', stdout, stderr });
    }, TOOL_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `spawn 失败: ${err.message}`, stdout, stderr });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, exitCode: code, stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }
      resolve({
        ok: false,
        exitCode: code,
        error: `退出码 ${code}`,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

module.exports = {
  executeTool,
  loadTools,
  toolsToOpenAISchema,
};
