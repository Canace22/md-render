const POSITION_PATTERN = /position\s+(\d+)/i;
const LINE_COLUMN_PATTERN = /line\s+(\d+)\s+column\s+(\d+)/i;

const getLineColumnFromPosition = (source, position) => {
  const safePosition = Math.min(Math.max(position, 0), source.length);
  const beforeError = source.slice(0, safePosition);
  const lines = beforeError.split('\n');

  return {
    position: safePosition,
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
};

export const getJsonErrorLocation = (error, source) => {
  const message = error instanceof Error ? error.message : String(error ?? '未知解析错误');
  const positionMatch = message.match(POSITION_PATTERN);
  if (positionMatch) {
    return {
      ...getLineColumnFromPosition(source, Number(positionMatch[1])),
      message,
    };
  }

  const lineColumnMatch = message.match(LINE_COLUMN_PATTERN);
  if (lineColumnMatch) {
    return {
      position: null,
      line: Number(lineColumnMatch[1]),
      column: Number(lineColumnMatch[2]),
      message,
    };
  }

  const fallbackPosition = /unexpected end/i.test(message) ? source.length : 0;
  return {
    ...getLineColumnFromPosition(source, fallbackPosition),
    message,
  };
};

export const parseJson = (source) => {
  const normalizedSource = String(source ?? '');
  if (!normalizedSource.trim()) {
    return { status: 'empty', value: null, error: null };
  }

  try {
    return {
      status: 'valid',
      value: JSON.parse(normalizedSource),
      error: null,
    };
  } catch (error) {
    return {
      status: 'invalid',
      value: null,
      error: getJsonErrorLocation(error, normalizedSource),
    };
  }
};

export const formatJson = (value, indentation = 2) => {
  const safeIndentation = indentation === 0 ? 0 : 2;
  return JSON.stringify(value, null, safeIndentation);
};

export const countJsonNodes = (value) => {
  let count = 0;
  const pending = [value];

  while (pending.length > 0) {
    const current = pending.pop();
    count += 1;
    if (current !== null && typeof current === 'object') {
      const children = Array.isArray(current) ? current : Object.values(current);
      children.forEach((child) => pending.push(child));
    }
  }

  return count;
};
