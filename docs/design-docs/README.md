# 项目目的
这两年 AI 编程助手火得一塌糊涂。GitHub Copilot、Cursor、Codex、Claude Code……工具一个比一个强，用起来确实爽。只需要用自然语言描述需求，AI 就能帮你写代码、改 Bug、跑测试，甚至排查之前让你绞尽脑汁的线上问题。
与此同时，Anthropic、OpenAI 这些前沿公司也在持续分享他们构建 Agent 的实践经验。 Anthropic 的 Engineering Blog 简直是个宝藏，持续分享很多关于 AI Agent 构建的实践干货，每次读完都有意犹未尽的感觉。

这些 Agent 到底是怎么工作的？不是说“LLM + 工具 + 循环 ”这种笼统的回答。我想知道的是更具体的东西——它怎么决定什么时候读文件、什么时候执行命令？工具调用是怎么串起来的？内存怎么管理？上下文工程是怎么串起来的？
说白了，会用 AI Agent 和理解 AI Agent 背后的详细原理，是两回事。

作为一个参与AI辅助开发提效得开发者，详细了解CodeAgent工作原理很有必要；就好比在使用Java语言的时候，如果要实现一个功能，我们不仅要知道语法，还要理解背后的设计模式、内存管理、性能优化等方面的知识。AI Agent 也是一样，只有真正理解了它的工作原理，才能更好地利用它，甚至在未来自己构建更复杂的 Agent。

所以有了这个项目，我想通过自己动手实现一个 mini 版的 CodeAgent，名字就叫做 NanoCode，来更深入地理解这些 AI Agent 的工作原理。这个 mini CodeAgent 的功能会类似于 ClaudeCode 或者 OpenCode，是一个命令行 CLI 程序，能够接受自然语言的指令，执行相应的代码操作.



# 开发方法

原则：AI实现AI

使用的AI工具：
- 方案设计：gemini （Gemini Pro） web版，免费，通过多轮交互来设计整个系统的架构和功能模块。
- 代码生成：ClaudeCode + Glm 、opencode ,哪个好用用哪个，主要负责生成具体的代码实现。

# NanoAgent 实现大纲

 - 技术栈：Node.js CLI 程序
 - 核心能力：Agent Loop、Tool/MCP/Skill 调用、上下文压缩、Memory 压缩、CLI InterFace、LLM Interface
 - 设计模式：ReAct（Reasoning → Acting → Observing 循环）