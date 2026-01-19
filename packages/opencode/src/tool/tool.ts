import z from "zod"
import type { MessageV2 } from "../session/message-v2"
import type { Agent } from "../agent/agent"
import type { PermissionNext } from "../permission/next"
import { Truncate } from "./truncation"

/**
 * Tool 命名空间用于统一封装和导出与工具（tool）相关的类型、接口及辅助方法。
 * 使用 namespace 主要为了代码结构清晰，将业务领域相关的类型集中管理，减少命名污染。
 * 现代 TypeScript 更多使用 ES Module 导出成员，而不是 namespace，但对于工具体系这样集中式管理仍有优势。
 */
export namespace Tool {
  /**
   * 工具元数据类型定义，允许扩展。设计为索引签名类型，是为了支持工具间高度异构的数据结构。
   * 元数据通常用于描述工具执行过程中的附加信息（如是否截断、摘要信息等）。
   */
  interface Metadata {
    [key: string]: any // 灵活扩展，允许存放任意类型的工具扩展数据
  }

  /**
   * 工具初始化时可获取到的上下文信息。
   * 目前主要包含可选的 agent 信息，为后续支持多代理自定义工具行为留接口。
   */
  export interface InitContext {
    agent?: Agent.Info
  }

  /**
   * 工具执行的上下文，贯穿工具的整个调用流程。
   * 此设计保证每个工具具备感知会话、消息、权限与中断控制的能力，适用于异步、可中断的分布式执行场景。
   * 
   * - sessionID/messageID/agent：用于定位调用源及归属。
   * - abort：支持外部取消，安全回收资源。
   * - callID/extra：预留扩展接口，支持多实例和自定义参数透传。
   * - metadata()：允许工具在执行期间向外部推送状态与元数据，便于 UI 刷新等需求。
   * - ask()：权限系统钩子，便于工具内部请求用户授权或安全校验。
   */
  export type Context<M extends Metadata = Metadata> = {
    sessionID: string           // 当前会话 ID
    messageID: string           // 当前消息 ID
    agent: string               // 触发工具的代理名
    abort: AbortSignal          // 支持任务取消（如用户中断执行等场景）
    callID?: string             // 工具执行调用的唯一标识（可用于多工具并发）
    extra?: { [key: string]: any } // 可选扩展字段，便于透传局部自定义参数
    metadata(input: { title?: string; metadata?: M }): void // 用于工具运行过程中的元数据更新（如进度、状态）
    ask(input: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">): Promise<void> // 业务级权限校验，确保敏感操作交互
  }

  /**
   * 工具注册结构体的接口设计。
   * - id: 工具唯一标识。
   * - init: 工具初始化逻辑，按需返回描述、参数 schema 及核心 execute 实现，异步设计便于依赖外部资源。
   * - parameters: 使用 zod 定义参数 schema，保证类型安全和输入校验的友好报错。
   * - execute: 工具的主执行函数。入参为已校验参数和当前上下文，返回结构化结果便于统一处理。
   * - formatValidationError: 支持自定义参数校验报错友好提示，提升扩展性和开发体验。
   * 
   * 这样设计可实现编译期参数/元数据精准提取和校验，便于高阶类型推断、自动接口生成。
   */
  export interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
    id: string
    init: (ctx?: InitContext) => Promise<{
      description: string                                // 工具描述，用于 UI/文档等
      parameters: Parameters                             // zod schema，强类型参数定义
      execute(
        args: z.infer<Parameters>,                       // 已校验参数类型（自动提取自 schema）
        ctx: Context,                                    // 工具当前上下文
      ): Promise<{
        title: string                                    // 工具执行产物标题
        metadata: M                                      // 扩展元数据
        output: string                                   // 主输出内容
        attachments?: MessageV2.FilePart[]               // 可能附加的文件附件
      }>
      formatValidationError?(error: z.ZodError): string  // 可选，自定义校验错误格式化（提升开发友好性）
    }>
  }

  /**
   * 类型体操：辅助类型，用于直接获得某个 Info 的参数类型，便于类型自动推断。
   * 这样工具调用时可编译期获得具体参数类型提示（IDE 支持增强）。
   */
  export type InferParameters<T extends Info> = T extends Info<infer P> ? z.infer<P> : never

  /**
   * 辅助类型，用于获取工具定义中的元数据类型。
   */
  export type InferMetadata<T extends Info> = T extends Info<any, infer M> ? M : never

  /**
   * 工具定义/注册辅助函数。
   * 通过包装工具的 init/execute 逻辑，实现：
   * - 强类型入参校验（zod schema）
   * - 统一输出规范（如自动裁剪输出文本，防止内容超长影响模型推理或 UI 展示）
   * - 格式化校验异常提示
   * 
   * 设计初衷：
   * 1. 工具注册统一入口，自动保证参数校验和输出规范化，减少开发者重复劳动。
   * 2. 支持工具自行处理截断时跳过自动截断（如大型文件分段、特殊二进制流）。
   * 3. 支持自定义错误消息，提升端到端开发体验。
   */
  export function define<Parameters extends z.ZodType, Result extends Metadata>(
    id: string,
    init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>,
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (initCtx) => {
        // 支持 init 既可为函数（惰性初始化）也可为已展开对象，便于开发与测试
        const toolInfo = init instanceof Function ? await init(initCtx) : init
        const execute = toolInfo.execute // 先保持原始 execute 引用

        // 重写 execute，增加输入参数类型校验以及自动输出裁剪逻辑
        toolInfo.execute = async (args, ctx) => {
          try {
            toolInfo.parameters.parse(args) // 保证参数类型/结构安全
          } catch (error) {
            // 支持自定义报错格式
            if (error instanceof z.ZodError && toolInfo.formatValidationError) {
              throw new Error(toolInfo.formatValidationError(error), { cause: error })
            }
            // 默认校验报错输出，要求使用者修正输入格式
            throw new Error(
              `The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`,
              { cause: error },
            )
          }
          // 工具主逻辑执行
          const result = await execute(args, ctx)

          // 工具如自行控制输出裁剪（如 outputPath），则跳过统一裁剪逻辑
          if (result.metadata.truncated !== undefined) {
            return result
          }
          // 对输出做统一裁剪，防止输出内容超长，影响模型输入或 UI 展示
          const truncated = await Truncate.output(result.output, {}, initCtx?.agent)
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,                         // 标记是否截断
              ...(truncated.truncated && { outputPath: truncated.outputPath }), // 若被截断则添加额外信息
            },
          }
        }
        return toolInfo
      },
    }
  }
}
