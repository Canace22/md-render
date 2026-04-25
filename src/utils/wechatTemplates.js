/**
 * 微信公众号复制排版模板
 * 每个模板定义一套独立的样式参数，用于 convertToWeChatHTML 转换
 */

/**
 * 默认简约：16px 字号、紧凑间距、浅灰边框
 */
const defaultSimple = {
  id: 'default',
  name: '默认简约',
  base: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#24292e',
    backgroundColor: '#ffffff',
  },
  linkColor: '#0366d6',
  borderColor: '#dfe2e5',
  headingBorderColor: '#eaecef',
  spacing: {
    paragraph: '8px',
    block: '8px',
    headingTop: { h1: '16px', h2: '14px', h3: '12px', h4: '10px', h5: '10px', h6: '10px' },
    headingBottom: { h1: '6px', h2: '5px', h3: '4px', h4: '4px', h5: '4px', h6: '4px' },
  },
  blockquote: {
    borderLeft: '0.25em solid #dfe2e5',
    padding: '0 1em',
  },
  statement: {
    border: '1px solid #c9302c',
    padding: '12px 16px',
    color: '#c9302c',
    fontStyle: 'normal',
  },
  autoStatement: '<strong>声明:</strong>本文为Canace 原创,不代表平台观点,未经许可禁止转载。',
  code: {
    fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
  },
  image: {
    margin: '8px auto',
    borderRadius: '4px',
  },
};

/**
 * InfoQ 风格：大间距、行高 1.8、蓝色强调
 * 对齐 infoQ 公众号：标题/副标题居中，分级字号、引用 secondary 色+斜体
 */
const infoq = {
  id: 'infoq',
  name: 'InfoQ 风格',
  base: {
    fontSize: '17px',
    lineHeight: '1.8',
    color: '#242424',
    backgroundColor: '#ffffff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  linkColor: '#0052CC',
  borderColor: '#E5E6EB',
  headingBorderColor: '#DCDFE6',
  headingFontSize: { h1: '24px', h2: '20px', h3: '18px', h4: '16px', h5: '15px', h6: '14px' },
  /** 标题 ##、副标题 ### 居中 */
  headingAlign: { h2: 'center', h3: 'center' },
  spacing: {
    paragraph: '24px',
    block: '16px',
    headingTop: { h1: '24px', h2: '20px', h3: '18px', h4: '16px', h5: '14px', h6: '12px' },
    headingBottom: { h1: '12px', h2: '10px', h3: '8px', h4: '6px', h5: '6px', h6: '6px' },
  },
  blockquote: {
    borderLeft: '4px solid #0052CC',
    padding: '0 16px',
    color: '#666666',
    fontStyle: 'italic',
  },
  /** 文章末尾声明块：以「声明」开头的 blockquote 使用此样式 */
  statement: {
    border: '1px solid #c9302c',
    padding: '12px 16px',
    color: '#c9302c',
    fontStyle: 'normal',
  },
  /** 复制时自动追加到文末的声明，留空则不追加 */
  autoStatement: '<strong>声明:</strong>本文为Canace 原创,不代表平台观点,未经许可禁止转载。',
  code: {
    fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
  },
  codeBlockBg: '#F5F7FA',
  image: {
    margin: '16px auto',
    borderRadius: '8px',
  },
};

/**
 * 暗黑风格：深色背景、浅色文字，适合暗色主题公众号
 */
const dark = {
  id: 'dark',
  name: '暗黑风格',
  base: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#e6edf3',
    backgroundColor: '#1e1e1e',
  },
  linkColor: '#58a6ff',
  borderColor: '#30363d',
  headingBorderColor: '#21262d',
  spacing: {
    paragraph: '8px',
    block: '8px',
    headingTop: { h1: '16px', h2: '14px', h3: '12px', h4: '10px', h5: '10px', h6: '10px' },
    headingBottom: { h1: '6px', h2: '5px', h3: '4px', h4: '4px', h5: '4px', h6: '4px' },
  },
  blockquote: {
    borderLeft: '0.25em solid #58a6ff',
    padding: '0 1em',
  },
  statement: {
    border: '1px solid #c9302c',
    padding: '12px 16px',
    color: '#c9302c',
    fontStyle: 'normal',
  },
  autoStatement: '<strong>声明:</strong>本文为Canace 原创,不代表平台观点,未经许可禁止转载。',
  code: {
    fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
  },
  image: {
    margin: '8px auto',
    borderRadius: '4px',
  },
};

/**
 * 掘金技术风：15px 字号、行高 1.8、h2 左侧蓝条、行内代码橙色、浅灰引用块
 */
const juejin = {
  id: 'juejin',
  name: '掘金技术风',
  base: {
    fontSize: '15px',
    lineHeight: '1.8',
    color: '#1d2129',
    backgroundColor: '#ffffff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
  linkColor: '#1e80ff',
  borderColor: '#e4e6eb',
  headingBorderColor: '#e4e6eb',
  headingFontSize: { h1: '24px', h2: '20px', h3: '18px', h4: '16px', h5: '15px', h6: '14px' },
  /** h2 左侧蓝色竖条，掘金标志性标题样式 */
  headingDecoration: {
    h2: {
      borderLeft: '4px solid #1e80ff',
      paddingLeft: '12px',
    },
    h3: {
      color: '#4e5969',
    },
  },
  spacing: {
    paragraph: '20px',
    block: '16px',
    headingTop: { h1: '28px', h2: '28px', h3: '22px', h4: '18px', h5: '14px', h6: '12px' },
    headingBottom: { h1: '14px', h2: '10px', h3: '8px', h4: '6px', h5: '6px', h6: '6px' },
  },
  blockquote: {
    borderLeft: '4px solid #dfe2e5',
    background: '#f8f9fa',
    padding: '12px 16px',
    color: '#72767b',
    fontStyle: 'normal',
  },
  statement: {
    border: '1px solid #c9302c',
    padding: '12px 16px',
    color: '#c9302c',
    fontStyle: 'normal',
  },
  autoStatement: '<strong>声明:</strong>本文为Canace 原创,不代表平台观点,未经许可禁止转载。',
  code: {
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace",
  },
  /** 代码块浅灰底，与掘金 light 主题对齐 */
  codeBlockBg: '#f0f2f5',
  /** 行内代码橙色高亮，掘金特征之一 */
  inlineCode: {
    background: '#f2f3f5',
    color: '#e96900',
    padding: '2px 6px',
    borderRadius: '3px',
  },
  image: {
    margin: '16px auto',
    borderRadius: '8px',
  },
};

const TEMPLATES = [defaultSimple, infoq, dark, juejin];

const getTemplateById = (id) => TEMPLATES.find((t) => t.id === id) ?? defaultSimple;

export { TEMPLATES, getTemplateById, defaultSimple, infoq, dark, juejin };
