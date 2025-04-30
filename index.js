// 导入必要的模块
import { getContext, extension_settings } from '../../../extensions.js'; // 确保路径正确
import { eventSource, event_types, getTokenCountAsync, main_api } from '../../../../script.js'; // 确保路径正确

const extensionName = "consumed-prompt-token-counter"; // 确保与你的插件文件夹名称一致

// --- 插件作用域内的临时变量 ---
let lastCalculatedPromptTokens = 0;
let lastUsedApi = '';
let pendingTokenConsumptionLog = false; // 标志位

// --- 插件主逻辑 ---
jQuery(async () => {
    console.log(`加载插件: ${extensionName}`);

    // 1. 监听 GENERATE_AFTER_DATA: 捕获数据并预计算 Token
    eventSource.on(event_types.GENERATE_AFTER_DATA, async (generateData) => {
        // console.log(`${extensionName}: GENERATE_AFTER_DATA 事件触发`);
        const context = getContext();
        const currentApi = context.mainApi; // 或者直接用导入的 main_api
        let promptTokens = 0;

        try {
            if (currentApi === 'openai') {
                const messages = generateData.prompt; // 这是消息数组
                if (Array.isArray(messages)) {
                    const tokenPromises = messages.map(message =>
                        getTokenCountAsync(message.content || '', 0)
                    );
                    const tokensPerMessage = await Promise.all(tokenPromises);
                    promptTokens = tokensPerMessage.reduce((sum, count) => sum + count, 0);
                }
            } else {
                const promptString = generateData.prompt; // 这是字符串
                if (typeof promptString === 'string') {
                    promptTokens = await getTokenCountAsync(promptString, 0);
                }
            }

            // 存储计算结果，并设置标志位
            lastCalculatedPromptTokens = promptTokens;
            lastUsedApi = currentApi;
            pendingTokenConsumptionLog = true; // 表示我们计算了 Token，等待确认消耗
            // console.log(`${extensionName}: 预计算 ${currentApi} 的 Prompt Tokens: ${promptTokens}，等待消耗确认...`);

        } catch (error) {
            console.error(`${extensionName}: 在 GENERATE_AFTER_DATA 中计算 Token 时出错:`, error);
            // 出错时也应重置标志位
            pendingTokenConsumptionLog = false;
        }
    });

    // 2. 监听 MESSAGE_RECEIVED: 确认 API 调用成功并记录 Token
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId, type) => {
        // console.log(`${extensionName}: MESSAGE_RECEIVED 事件触发 (ID: ${messageId}, Type: ${type})`);
        // 检查标志位，确认这次消息接收是否对应我们等待确认的 Token 消耗
        if (pendingTokenConsumptionLog) {
            console.log(`[${extensionName}] API 调用成功 (${lastUsedApi})，消耗的 Prompt Tokens: ${lastCalculatedPromptTokens}`);

            // --- 在这里使用 lastCalculatedPromptTokens 和 lastUsedApi ---
            // 例如: 更新 UI, 发送到分析服务等
            // updateMyPluginUI(lastCalculatedPromptTokens);
            // sendAnalytics('prompt_tokens_consumed', { api: lastUsedApi, tokens: lastCalculatedPromptTokens });

            // 重置标志位，防止重复记录
            pendingTokenConsumptionLog = false;
            lastCalculatedPromptTokens = 0;
            lastUsedApi = '';
        }
        // 如果标志位已经是 false，说明这次 MESSAGE_RECEIVED 可能不是我们等待的那次，或者之前的生成被中断了，忽略即可
    });

    // 3. 监听 GENERATION_STOPPED: 处理生成中断或失败的情况
    eventSource.on(event_types.GENERATION_STOPPED, () => {
        // console.log(`${extensionName}: GENERATION_STOPPED 事件触发`);
        // 如果生成被停止（无论是用户手动停止还是出错），但我们还在等待消耗确认
        if (pendingTokenConsumptionLog) {
            // console.log(`${extensionName}: 生成已停止，取消待处理的 Token 消耗记录。`);
            // 重置状态，因为这次预计算的 Token 没有真正被消耗
            pendingTokenConsumptionLog = false;
            lastCalculatedPromptTokens = 0;
            lastUsedApi = '';
        }
    });

     // 可选: 监听其他可能表示生成失败或中断的事件，并重置 pendingTokenConsumptionLog
     // 例如，如果你的插件或核心逻辑能捕获到API请求本身的失败错误

    console.log(`插件 ${extensionName} 初始化完成，已监听相关事件以统计消耗的 Prompt Tokens。`);
});

// (可选) 你的其他插件函数，例如更新 UI 或发送分析
// function updateMyPluginUI(tokens) { ... }
// function sendAnalytics(eventName, data) { ... }
