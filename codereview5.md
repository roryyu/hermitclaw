让我检查Hermitclaw项目是否有现有的插件系统或扩展机制，以便了解如何集成飞书插件。
        
            
toolName: search_by_regex
            
status: success
          
query: plugin|extension|module|addon
          
我需要检查一下Hermitclaw项目的入口文件和主要组件，以便了解如何最好地集成飞书插件。
        
            
toolName: view_files
            
status: success
          
            
filePath: /Users/roryyu/Downloads/code/opencode-app/hermitclaw/src/cli/index.ts
          
让我查看项目的package.json，了解项目的依赖和脚本，以便更好地规划飞书插件的集成方案。
        
            
toolName: view_files
            
status: success
          
            
filePath: /Users/roryyu/Downloads/code/opencode-app/hermitclaw/package.json
          
# Hermitclaw 集成飞书插件方案

## 1. 集成概述

飞书插件 `openclaw-lark` 是为 OpenClaw 设计的官方飞书集成插件，提供了与飞书工作区的全面交互能力。要在 Hermitclaw 中集成此插件，需要创建适配层和扩展现有架构。

## 2. 主要修改点

### 2.1 项目结构扩展

```
hermitclaw/
├── src/
│   ├── ... 现有目录 ...
│   └── plugins/            # 新增：插件系统
│       ├── index.ts       # 插件管理器
│       └── lark/          # 飞书插件集成
│           ├── index.ts   # 飞书插件入口
│           ├── adapter.ts # OpenClaw到Hermitclaw的适配层
│           └── config.ts  # 飞书插件配置
```

### 2.2 依赖安装

```bash
npm install openclaw-lark
npm install --save-dev @types/openclaw-lark
```

### 2.3 插件系统实现

```typescript
// 建议新增文件 - src/plugins/index.ts
import type { Agent } from '../agent/runtime.js';

export interface Plugin {
  name: string;
  description: string;
  init: (config: any) => Promise<void>;
  getTools?: () => any[];
  // 其他插件接口
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  
  async registerPlugin(plugin: Plugin, config: any): Promise<void> {
    await plugin.init(config);
    this.plugins.set(plugin.name, plugin);
    console.log(`Plugin registered: ${plugin.name}`);
  }
  
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }
  
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
}

// 全局插件管理器实例
export const pluginManager = new PluginManager();
```

### 2.4 飞书插件适配层

```typescript
// 建议新增文件 - src/plugins/lark/adapter.ts
import { LarkPlugin as OpenClawLarkPlugin } from 'openclaw-lark';
import type { Plugin } from '../index.js';
import type { Agent } from '../../agent/runtime.js';

export class LarkPlugin implements Plugin {
  name = 'lark';
  description = 'Feishu/Lark integration plugin';
  
  private openClawPlugin: OpenClawLarkPlugin;
  
  async init(config: any): Promise<void> {
    // 创建OpenClaw飞书插件实例
    this.openClawPlugin = new OpenClawLarkPlugin(config);
    
    // 初始化插件
    await this.openClawPlugin.init();
  }
  
  getTools(): any[] {
    // 适配OpenClaw工具到Hermitclaw格式
    const openClawTools = this.openClawPlugin.getTools();
    return openClawTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      async execute(params: any): Promise<string> {
        return await tool.execute(params);
      }
    }));
  }
  
  // 添加飞书特有方法
  async sendMessage(chatId: string, content: string): Promise<void> {
    await this.openClawPlugin.sendMessage(chatId, content);
  }
  
  async readMessages(chatId: string, limit: number = 10): Promise<any[]> {
    return await this.openClawPlugin.readMessages(chatId, limit);
  }
}
```

### 2.5 飞书配置扩展

```typescript
// 建议修改 - src/config/index.ts
export interface HermitConfig {
  // ... 现有配置 ...
  plugins: {
    lark?: {
      appId: string;
      appSecret: string;
      encryptKey?: string;
      verificationToken?: string;
      // 其他飞书配置项
    };
  };
}

const DEFAULT_CONFIG: HermitConfig = {
  // ... 现有默认配置 ...
  plugins: {
    lark: {
      appId: '',
      appSecret: '',
      encryptKey: '',
      verificationToken: ''
    }
  }
};

// 加载飞书环境变量
if (process.env.LARK_APP_ID) {
  config.plugins.lark = {
    ...config.plugins.lark,
    appId: process.env.LARK_APP_ID
  };
}

if (process.env.LARK_APP_SECRET) {
  config.plugins.lark = {
    ...config.plugins.lark,
    appSecret: process.env.LARK_APP_SECRET
  };
}

// 其他飞书配置环境变量...
```

### 2.6 Agent集成

```typescript
// 建议修改 - src/agent/runtime.ts
import { pluginManager } from '../plugins/index.js';

export class Agent {
  // ... 现有代码 ...
  
  async *run(
    messages: Message[],
    onChunk?: (chunk: ChatChunk) => void
  ): AsyncIterable<ChatChunk> {
    // 获取所有插件的工具
    const pluginTools = pluginManager.getAllPlugins()
      .flatMap(plugin => plugin.getTools?.() || []);
    
    const toolDefs = [...getToolDefs(), ...pluginTools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }))];

    const params = {
      model: this.model,
      messages,
      system: this.systemPrompt,
      tools: toolDefs.length > 0 ? toolDefs : undefined
    };
    
    // ... 现有代码 ...
    
    for (const tc of toolCalls) {
      // 检查是否是插件工具
      let tool = getTool(tc.name);
      
      // 如果不是内置工具，检查插件工具
      if (!tool) {
        const allPluginTools = pluginManager.getAllPlugins()
          .flatMap(plugin => plugin.getTools?.() || []);
        tool = allPluginTools.find(t => t.name === tc.name);
      }
      
      let resultContent: string;

      if (tool) {
        try {
          const args = JSON.parse(tc.arguments);
          resultContent = await tool.execute(args);
        } catch (error: unknown) {
          const err = error as { message?: string };
          resultContent = `Tool error: ${err.message || 'Unknown error'}`;
        }
      } else {
        resultContent = `Unknown tool: ${tc.name}`;
      }
      
      // ... 现有代码 ...
    }
    
    // ... 现有代码 ...
  }
}
```

### 2.7 CLI命令扩展

```typescript
// 建议新增文件 - src/cli/lark.ts
import { Command } from 'commander';
import { pluginManager } from '../plugins/index.js';
import { LarkPlugin } from '../plugins/lark/adapter.js';
import { loadConfig } from '../config/index.js';

export const larkCommand = new Command('lark')
  .description('Feishu/Lark integration commands');

larkCommand
  .command('init')
  .description('Initialize Feishu/Lark plugin')
  .option('--app-id <appId>', 'Feishu/Lark App ID')
  .option('--app-secret <appSecret>', 'Feishu/Lark App Secret')
  .action(async (options) => {
    const config = loadConfig();
    
    // 更新飞书配置
    config.plugins.lark = {
      ...config.plugins.lark,
      appId: options.appId || config.plugins.lark?.appId,
      appSecret: options.appSecret || config.plugins.lark?.appSecret
    };
    
    // 保存配置
    saveConfig(config);
    
    // 初始化飞书插件
    const larkPlugin = new LarkPlugin();
    await pluginManager.registerPlugin(larkPlugin, config.plugins.lark);
    
    console.log('Feishu/Lark plugin initialized successfully');
  });

larkCommand
  .command('send <chatId> <message>')
  .description('Send message to Feishu/Lark chat')
  .action(async (chatId, message) => {
    const larkPlugin = pluginManager.getPlugin('lark') as LarkPlugin;
    
    if (!larkPlugin) {
      console.error('Feishu/Lark plugin not initialized. Run "hermitclaw lark init" first.');
      process.exit(1);
    }
    
    await larkPlugin.sendMessage(chatId, message);
    console.log(`Message sent to chat ${chatId}`);
  });

larkCommand
  .command('read <chatId>')
  .description('Read messages from Feishu/Lark chat')
  .option('-l, --limit <limit>', 'Number of messages to read', '10')
  .action(async (chatId, options) => {
    const larkPlugin = pluginManager.getPlugin('lark') as LarkPlugin;
    
    if (!larkPlugin) {
      console.error('Feishu/Lark plugin not initialized. Run "hermitclaw lark init" first.');
      process.exit(1);
    }
    
    const messages = await larkPlugin.readMessages(chatId, parseInt(options.limit));
    console.log(`Messages from chat ${chatId}:`);
    messages.forEach((msg, index) => {
      console.log(`${index + 1}. ${msg.content}`);
    });
  });
```

### 2.8 主程序集成

```typescript
// 建议修改 - src/cli/index.ts
import { Command } from 'commander';
import { gatewayCommand } from './gateway.js';
import { chatCommand } from './chat.js';
import { sessionCommand } from './session.js';
import { larkCommand } from './lark.js';  // 导入飞书命令
import { loadConfig } from '../config/index.js';
import { pluginManager } from '../plugins/index.js';
import { LarkPlugin } from '../plugins/lark/adapter.js';

export async function run(): Promise<void> {
  const program = new Command();
  
  // ... 现有代码 ...
  
  program.addCommand(gatewayCommand);
  program.addCommand(chatCommand);
  program.addCommand(sessionCommand);
  program.addCommand(larkCommand);  // 添加飞书命令
  
  // 初始化配置
  const config = loadConfig();
  
  // 自动初始化已配置的插件
  if (config.plugins.lark?.appId && config.plugins.lark?.appSecret) {
    try {
      const larkPlugin = new LarkPlugin();
      await pluginManager.registerPlugin(larkPlugin, config.plugins.lark);
    } catch (error) {
      console.warn(`Failed to initialize Feishu/Lark plugin: ${error}`);
    }
  }
  
  program.parse();
}
```

## 3. 关键注意事项

1. **版本兼容性**：确保 Hermitclaw 使用的 Node.js 版本（>=22）满足飞书插件的要求
2. **权限配置**：飞书插件需要正确的 App ID、App Secret 和权限配置
3. **安全考虑**：飞书插件具有较高权限，应实施适当的安全措施
4. **错误处理**：添加完善的错误处理机制，特别是网络请求和API调用
5. **测试**：在生产环境部署前进行充分的测试，确保集成稳定

## 4. 集成收益

通过集成飞书插件，Hermitclaw 将获得以下功能：

- 💬 飞书消息的读写和搜索
- 📄 飞书文档的创建、更新和阅读
- 📊 飞书表格的管理和数据操作
- 📅 飞书日历的事件管理
- ✅ 飞书任务的创建和跟踪
- 📱 交互式卡片和流式响应支持

这些功能将使 Hermitclaw 成为一个更强大的 AI 助手，能够无缝集成到飞书工作流中。