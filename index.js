// 导入必要的模块
import { getContext, extension_settings } from '../../../extensions.js'; // 确保路径正确
import { eventSource, event_types, main_api } from '../../../../script.js'; // 确保路径正确
import { getTokenCountAsync } from '../../../tokenizers.js';

const extensionName = "tokens"; // 确保与你的插件文件夹名称一致

// --- 插件作用域内的临时变量 ---
let lastCalculatedPromptTokens = 0;
let lastUsedApi = '';
let pendingTokenConsumptionLog = false; // 标志位

// --- 插件主逻辑 ---
jQuery(async () => {
    console.log(`加载插件: ${extensionName}`);

    // 1. 监听 GENERATE_AFTER_DATA: 捕获数据并预计算 Token
    eventSource.on(event_types.GENERATE_AFTER_DATA, async (generateData) => {
        const context = getContext();
        const currentApi = context.mainApi;
        let promptTokens = 0;

        try {
            if (currentApi === 'openai') {
                const messages = generateData.prompt;
                if (Array.isArray(messages)) {
                    const tokenPromises = messages.map(message =>
                        getTokenCountAsync(message.content || '', 0)
                    );
                    const tokensPerMessage = await Promise.all(tokenPromises);
                    promptTokens = tokensPerMessage.reduce((sum, count) => sum + count, 0);
                }
            } else {
                const promptString = generateData.prompt;
                if (typeof promptString === 'string') {
                    promptTokens = await getTokenCountAsync(promptString, 0);
                }
            }

            lastCalculatedPromptTokens = promptTokens;
            lastUsedApi = currentApi;
            pendingTokenConsumptionLog = true;
            // 可以在这里也打印预计算值（可选）
            // console.log(`[${extensionName}] 预计算 ${currentApi} 的 Prompt Tokens: ${promptTokens}，等待消耗确认...`);

        } catch (error) {
            console.error(`${extensionName}: 在 GENERATE_AFTER_DATA 中计算 Token 时出错:`, error);
            pendingTokenConsumptionLog = false; // 出错时重置
        }
    });

    // 2. 监听 MESSAGE_RECEIVED: 确认 API 调用成功并记录 Token 到控制台
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId, type) => {
        if (pendingTokenConsumptionLog) {
            console.log(`[${extensionName}] API Call Succeeded (${lastUsedApi}): Consumed Prompt Tokens: ${lastCalculatedPromptTokens}`);

            // 重置标志位，防止重复记录
            pendingTokenConsumptionLog = false;
            lastCalculatedPromptTokens = 0;
            lastUsedApi = '';
        }
    });

    // 3. 监听 GENERATION_STOPPED: 处理生成中断或失败的情况
    eventSource.on(event_types.GENERATION_STOPPED, () => {
        if (pendingTokenConsumptionLog) {
            // 如果生成停止时仍有待处理的日志，说明未消耗，重置状态
            // console.log(`[${extensionName}] 生成已停止，取消待处理的 Token 消耗记录。`);
            pendingTokenConsumptionLog = false;
            lastCalculatedPromptTokens = 0;
            lastUsedApi = '';
        }
    });

    console.log(`插件 ${extensionName} 初始化完成，消耗的 Prompt Tokens 将在成功生成后打印到控制台。`);
});
