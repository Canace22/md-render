/**
 * 应用主逻辑
 * 连接输入、解析和渲染
 */

(function() {
    const parser = new MarkdownParser();
    const renderer = new MarkdownRenderer();
    
    const inputElement = document.getElementById('markdown-input');
    const outputElement = document.getElementById('markdown-output');

    /**
     * 复制代码到剪贴板
     */
    function copyCode(button, codeContent) {
        navigator.clipboard.writeText(codeContent).then(() => {
            // 显示复制成功反馈
            button.classList.add('copied');
            setTimeout(() => {
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('复制失败:', err);
            // 降级方案：使用传统方法
            const textArea = document.createElement('textarea');
            textArea.value = codeContent;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                button.classList.add('copied');
                setTimeout(() => {
                    button.classList.remove('copied');
                }, 2000);
            } catch (err) {
                console.error('降级复制也失败:', err);
            }
            document.body.removeChild(textArea);
        });
    }

    /**
     * 绑定复制按钮事件
     */
    function bindCopyButtons() {
        const copyButtons = outputElement.querySelectorAll('.code-copy-btn');
        copyButtons.forEach(button => {
            // 移除已有的事件监听器（避免重复绑定）
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            // 获取代码内容
            const codeBlock = newButton.closest('.code-block');
            const encodedContent = codeBlock.getAttribute('data-code');
            const codeContent = decodeURIComponent(encodedContent);
            
            // 绑定点击事件
            newButton.addEventListener('click', () => {
                copyCode(newButton, codeContent);
            });
        });
    }

    /**
     * 更新渲染结果
     */
    function updatePreview() {
        const markdownText = inputElement.value;
        const tokens = parser.parse(markdownText);
        const html = renderer.render(tokens);
        outputElement.innerHTML = html;

        // 代码高亮
        if (window.hljs) {
            window.hljs.highlightAll();
        }

        // 绑定复制按钮事件
        bindCopyButtons();
    }

    // 监听输入变化
    inputElement.addEventListener('input', updatePreview);

    // 初始化渲染
    updatePreview();
})();

