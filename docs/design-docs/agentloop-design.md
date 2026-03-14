核心设计哲学：让 LLM 专注于推理，让 Loop负责环境感知、状态管理和容错
核心功能：
● 状态机循环：
  ○ idle → thinking → acting → observing → completed + 
  ○ 中断与抢占机制： 在 Agent 运行过程中可以发送新指令修正方向，而不必等当前任务跑完  
● 工具管理 ：动态注册/注销工具，Map 存储快速查找
● Prompt 引擎：构建 System Prompt、注入工具定义与上下文，模板管理、动态组装、工具 Schema 生成
● 流式响应：支持 LLM streaming，实时输出思考过程
● 并行工具执行：顺序执行工具调用，返回 ToolResult
● 思考链追踪：
  ○ 记录推理过程，便于调试，显式Thought追踪
  ○ Reflection
● 会话持久化：支持挂起/恢复会话状态
● 迭代限制：
  ○ 基于 token 阈值自动计算 maxIterations 
  ○ 执行计划预生成（Planning Phase）： 在正式进入 thinking → acting 循环之前，先让 LLM 输出一个高层执行计划  
● 观察记录：记录工具执行结果到 observations
● LLM 交互：调用 LLM 获取响应，支持 tool_calls
● 权限控制：危险工具需要用户批准（permissionLevel）
● 上下文压缩 ： 支持 lru、smart、none 三种策略
● 错误处理   ： try-catch 捕获异常，状态转为 error
●  子 Agent 调度  ： 复杂任务可以分解成子任务，每个子任务启动一个独立的 mini Loop，父 Loop 只负责协调和汇总结果。这是从单 Agent 走向 Multi-Agent 的关键扩展点 