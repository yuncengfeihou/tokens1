// 导入必要的模块
import { getContext, extension_settings } from '../../../extensions.js'; // 确保路径正确
import { eventSource, event_types, main_api } from '../../../../script.js'; // 确保路径正确
import { getTokenCountAsync } from '../../../tokenizers.js';

const extensionName = "tokens1"; // 确保与你的插件文件夹名称一致


// --- 插件作用域内的临时变量 ---
let lastCalculatedPromptTokens = 0;
let lastUsedApi = '';
let pendingTokenConsumptionLog = false; // 标志位
let generationId = 0; // 添加一个 ID 来追踪流程，方便区分连续请求

// --- 插件主逻辑 ---
jQuery(async () => {
    // 这个日志应该总能看到
    console.log(`[${extensionName}] 插件已加载并初始化事件监听器。`);

    // 1. 监听 GENERATION_STARTED: 确认生成流程开始
    eventSource.on(event_types.GENERATION_STARTED, (type, options, dryRun) => {
         console.log(`[${extensionName}] === GENERATION_STARTED === (Type: ${type}, DryRun: ${dryRun})`);
    });

    // 2. 监听 GENERATE_AFTER_DATA: 捕获数据并预计算 Token
    eventSource.on(event_types.GENERATE_AFTER_DATA, async (generateData) => {
        const currentGenerationId = ++generationId; // 为本次生成分配 ID
        console.log(`[${extensionName} / Gen ${currentGenerationId}] >>> GENERATE_AFTER_DATA 事件触发`);
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
                } else {
                     console.warn(`[${extensionName} / Gen ${currentGenerationId}] OpenAI generateData.prompt 格式非预期数组:`, messages);
                }
            } else {
                const promptString = generateData.prompt;
                if (typeof promptString === 'string') {
                    promptTokens = await getTokenCountAsync(promptString, 0);
                } else {
                    console.warn(`[${extensionName} / Gen ${currentGenerationId}] ${currentApi} generateData.prompt 格式非预期字符串:`, promptString);
                }
            }

            // 存储计算结果，并设置标志位
            lastCalculatedPromptTokens = promptTokens;
            lastUsedApi = currentApi;
            pendingTokenConsumptionLog = true; // 表示我们计算了 Token，等待确认消耗
            console.log(`[${extensionName} / Gen ${currentGenerationId}] 预计算 ${currentApi} 的 Prompt Tokens: ${promptTokens}。设置 pendingTokenConsumptionLog = true`);

        } catch (error) {
            console.error(`[${extensionName} / Gen ${currentGenerationId}] 在 GENERATE_AFTER_DATA 中计算 Token 时出错:`, error);
            pendingTokenConsumptionLog = false; // 出错时重置
            console.log(`[${extensionName} / Gen ${currentGenerationId}] 出错，设置 pendingTokenConsumptionLog = false`);
        }
        console.log(`[${extensionName} / Gen ${currentGenerationId}] <<< GENERATE_AFTER_DATA 事件处理结束`);
    });

    // 3. 监听 MESSAGE_RECEIVED: 确认 API 调用成功并记录 Token 到控制台
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId, type) => {
        // 这个日志应该在每次收到新消息时看到
        console.log(`[${extensionName}] >>> MESSAGE_RECEIVED 事件触发 (ID: ${messageId}, Type: ${type})。当前 pendingTokenConsumptionLog = ${pendingTokenConsumptionLog}`);
        if (pendingTokenConsumptionLog) {
            // 这是我们期望看到的最终日志
            console.log(`%c[${extensionName}] +++ 确认消耗 (${lastUsedApi}) - 消耗的 Prompt Tokens: ${lastCalculatedPromptTokens} +++`, 'color: green; font-weight: bold;');

            // 重置标志位，防止重复记录
            pendingTokenConsumptionLog = false;
            console.log(`[${extensionName}] 重置 pendingTokenConsumptionLog = false (因为 MESSAGE_RECEIVED)`);
            lastCalculatedPromptTokens = 0;
            lastUsedApi = '';
        } else {
             console.log(`[${extensionName}] 收到 MESSAGE_RECEIVED 但 pendingTokenConsumptionLog 为 false，忽略此次 Token 记录。`);
        }
         console.log(`[${extensionName}] <<< MESSAGE_RECEIVED 事件处理结束`);
    });

    // 4. 监听 GENERATION_STOPPED: 处理生成中断或失败的情况
    eventSource.on(event_types.GENERATION_STOPPED, () => {
         // 这个日志应该在生成停止时看到
        console.log(`[${extensionName}] >>> GENERATION_STOPPED 事件触发。当前 pendingTokenConsumptionLog = ${pendingTokenConsumptionLog}`);
        if (pendingTokenConsumptionLog) {
            console.log(`[${extensionName}] --- 生成已停止/失败，取消待处理的 Token 消耗记录。重置 pendingTokenConsumptionLog = false ---`);
            // 重置状态，因为这次预计算的 Token 没有真正被消耗
            pendingTokenConsumptionLog = false;
            lastCalculatedPromptTokens = 0;
            lastUsedApi = '';
        } else {
             console.log(`[${extensionName}] 收到 GENERATION_STOPPED 但 pendingTokenConsumptionLog 已为 false。`);
        }
         console.log(`[${extensionName}] <<< GENERATION_STOPPED 事件处理结束`);
    });

     // 5. 可选: 监听 GENERATION_ENDED 帮助追踪流程 (非流式或流式结束后触发)
    eventSource.on(event_types.GENERATION_ENDED, (lastMessageId) => {
         console.log(`[${extensionName}] === GENERATION_ENDED === (Last Message ID: ${lastMessageId})`);
    });

});
