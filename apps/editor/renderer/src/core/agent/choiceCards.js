const CHOICE_BLOCK_PATTERN = /<!--\s*agent-choice\s*([\s\S]*?)\s*-->/i;
const MAX_CHOICE_COUNT = 6;

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const cleanTitle = (value) =>
  normalizeText(value)
    .replace(/\*\*/g, '')
    .replace(/^\*+|\*+$/g, '')
    .replace(/[，,。；;：:]+$/g, '')
    .trim();

const buildPrompt = (choice) => {
  const label = normalizeText(choice.label);
  const title = normalizeText(choice.title);
  const description = normalizeText(choice.description);
  return normalizeText(choice.prompt)
    || `我选择 ${[label, title || description].filter(Boolean).join('：')}`;
};

const normalizeChoice = (choice) => {
  if (!choice || typeof choice !== 'object') return null;
  const label = normalizeText(choice.label).slice(0, 16);
  const title = normalizeText(choice.title).slice(0, 48);
  const description = normalizeText(choice.description).slice(0, 160);
  if (!label && !title) return null;
  const normalized = {
    label: label || title,
    title,
    description,
    prompt: '',
  };
  normalized.prompt = buildPrompt({ ...choice, ...normalized });
  return normalized;
};

const normalizeChoices = (choices) => {
  if (!Array.isArray(choices)) return [];
  return choices
    .map(normalizeChoice)
    .filter(Boolean)
    .slice(0, MAX_CHOICE_COUNT);
};

const parseStructuredChoices = (text) => {
  const match = CHOICE_BLOCK_PATTERN.exec(text);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1].trim());
    const choices = normalizeChoices(payload?.options);
    if (choices.length < 2) return null;
    return {
      displayText: text.replace(match[0], '').trim(),
      choices,
    };
  } catch {
    return null;
  }
};

const parseFallbackLine = (line) => {
  const trimmed = line.trim();
  const match = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?([A-F])(?:[.、:：）)]|\s+)(.+)$/i);
  if (!match) return null;

  const label = match[1].toUpperCase();
  const body = cleanTitle(match[2]);
  if (!body || body.length < 2) return null;

  const parts = body.split(/[，,。；;：:]\s*/).filter(Boolean);
  const rawTitle = cleanTitle(parts[0] || body);
  const fallbackDescription = cleanTitle(parts.slice(1).join('，')) || body;
  const parsedTitle = cleanTitle(rawTitle.replace(new RegExp(`^${label}\\s+`, 'i'), ''));
  const title = parsedTitle.toUpperCase() === label ? fallbackDescription : parsedTitle || fallbackDescription;
  const description = fallbackDescription === title ? '' : fallbackDescription;
  return normalizeChoice({
    label,
    title,
    description,
    prompt: `我选择 ${label}：${title}`,
  });
};

const shouldTryFallback = (text) => /选择|选项|确认|挑一个|选哪个|哪个方案|A\/B|A B|方案/i.test(text);

const parseFallbackChoices = (text) => {
  if (!shouldTryFallback(text)) return [];
  const choices = text
    .split('\n')
    .map(parseFallbackLine)
    .filter(Boolean);
  const unique = [];
  const seen = new Set();
  choices.forEach((choice) => {
    if (seen.has(choice.label)) return;
    seen.add(choice.label);
    unique.push(choice);
  });
  return unique.length >= 2 ? unique.slice(0, MAX_CHOICE_COUNT) : [];
};

export const parseAssistantChoiceCards = (text) => {
  const rawText = String(text ?? '');
  const structured = parseStructuredChoices(rawText);
  if (structured) return structured;

  return {
    displayText: rawText,
    choices: parseFallbackChoices(rawText),
  };
};
