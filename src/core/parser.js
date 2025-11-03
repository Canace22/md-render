/**
 * Markdown 解析器
 * 将 Markdown 文本解析为结构化的 token 数组
 */

export class MarkdownParser {
    /**
     * 解析 Markdown 文本
     * @param {string} text - Markdown 文本
     * @returns {Array} token 数组
     */
    parse(text) {
        const lines = text.split('\n');
        const tokens = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // 空行
            if (!trimmedLine) {
                tokens.push({ type: 'empty' });
                i++;
                continue;
            }

            // 代码块
            if (trimmedLine.startsWith('```')) {
                const block = this.parseCodeBlock(lines, i);
                tokens.push(block.token);
                i = block.nextIndex;
                continue;
            }

            // 引用
            if (trimmedLine.startsWith('> ')) {
                tokens.push({
                    type: 'blockquote',
                    content: trimmedLine.substring(2)
                });
                i++;
                continue;
            }

            // 标题
            const heading = this.parseHeading(line);
            if (heading) {
                tokens.push(heading);
                i++;
                continue;
            }

            // 无序列表
            if (/^[\-\*\+]\s/.test(trimmedLine)) {
                const list = this.parseList(lines, i, 'unordered');
                tokens.push(list.token);
                i = list.nextIndex;
                continue;
            }

            // 有序列表
            if (/^\d+\.\s/.test(trimmedLine)) {
                const list = this.parseList(lines, i, 'ordered');
                tokens.push(list.token);
                i = list.nextIndex;
                continue;
            }

            // 水平分割线
            if (/^[-*_]{3,}$/.test(trimmedLine)) {
                tokens.push({ type: 'hr' });
                i++;
                continue;
            }

            // 普通段落
            tokens.push({
                type: 'paragraph',
                content: line
            });
            i++;
        }

        return tokens;
    }

    /**
     * 解析标题
     */
    parseHeading(line) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
            return {
                type: 'heading',
                level: match[1].length,
                content: match[2]
            };
        }
        return null;
    }

    /**
     * 解析代码块
     */
    parseCodeBlock(lines, startIndex) {
        const firstLine = lines[startIndex].trim();
        const language = firstLine.substring(3).trim() || 'plain';
        const codeLines = [];
        let i = startIndex + 1;

        while (i < lines.length) {
            if (lines[i].trim() === '```') {
                return {
                    token: {
                        type: 'code-block',
                        language,
                        content: codeLines.join('\n')
                    },
                    nextIndex: i + 1
                };
            }
            codeLines.push(lines[i]);
            i++;
        }

        // 如果没有找到结束标记，返回所有内容
        return {
            token: {
                type: 'code-block',
                language,
                content: codeLines.join('\n')
            },
            nextIndex: i
        };
    }

    /**
     * 解析列表（支持多层嵌套）
     */
    parseList(lines, startIndex, listType, baseIndent = 0) {
        const items = [];
        let i = startIndex;
        const listPattern = listType === 'ordered' ? /^\d+\.\s/ : /^[\-\*\+]\s/;

        while (i < lines.length) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // 计算当前行的缩进
            const indentMatch = line.match(/^(\s*)/);
            const currentIndent = indentMatch ? indentMatch[1].length : 0;

            // 如果缩进小于基准缩进，说明回到了上一层级，结束当前列表
            if (trimmedLine && currentIndent < baseIndent) {
                break;
            }

            // 检查是否是当前层级的列表项（缩进等于基准缩进）
            if (currentIndent === baseIndent && listPattern.test(trimmedLine)) {
                const content = trimmedLine.replace(listPattern, '');
                const item = this.parseInline(content);
                item.indent = currentIndent;
                items.push(item);
            } else if (trimmedLine && currentIndent > baseIndent) {
                // 嵌套列表：检测嵌套列表的类型和缩进
                const nestedUnorderedMatch = line.match(/^(\s+)([\-\*\+]\s.+)$/);
                const nestedOrderedMatch = line.match(/^(\s+)(\d+\.\s.+)$/);

                if (nestedUnorderedMatch || nestedOrderedMatch) {
                    // 确定嵌套列表类型
                    const nestedListType = nestedUnorderedMatch ? 'unordered' : 'ordered';
                    const nestedIndent = nestedUnorderedMatch ? nestedUnorderedMatch[1].length : nestedOrderedMatch[1].length;
                    
                    // 解析嵌套列表
                    const nestedList = this.parseList(lines, i, nestedListType, nestedIndent);
                    
                    // 将嵌套列表添加到最后一个项目
                    if (items.length > 0) {
                        const lastItem = items[items.length - 1];
                        if (!lastItem.children) {
                            lastItem.children = [];
                        }
                        lastItem.children.push(nestedList.token);
                    }
                    
                    i = nestedList.nextIndex - 1; // -1 因为外层循环会 +1
                } else if (trimmedLine) {
                    // 非列表项，结束列表
                    break;
                }
            } else if (trimmedLine && currentIndent === baseIndent) {
                // 同层级非列表项，结束列表
                break;
            }

            i++;
        }

        return {
            token: {
                type: 'list',
                listType,
                items
            },
            nextIndex: i
        };
    }

    /**
     * 解析行内元素（链接、强调、代码等）
     */
    parseInline(text) {
        // 先处理代码（避免与其他语法冲突）
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 处理粗体和斜体
        text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // 处理链接 [text](url)
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        return {
            content: text,
            raw: text
        };
    }
}

