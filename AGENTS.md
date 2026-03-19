# 编码规范

本文档定义了在进行代码编写时应遵循的规范和风格约定，主要适用于 UmiJS + Ant Design + TypeScript 项目。

## 总则

1. **最小化改动** - 只修改完成任务所需的最少代码，避免过度工程化
2. **复用优先** - 优先使用现有组件和工具函数，不要重复造轮子
3. **遵循约定** - 严格遵循项目的既定模式和命名规范
4. **务实类型** - 公共组件/函数要有完整类型定义，业务接口可用 `any`

## 技术栈约束

### 框架与库
- **UmiJS 4.x** - 路由、状态管理、请求封装
- **React 18** - 函数式组件 + Hooks
- **TypeScript** - 类型定义（灵活使用，不强制完美类型）
- **Ant Design 5.x** - UI 组件库
- **echarts** + **echarts-for-react** - 图表库
- **dayjs** - 时间处理（不要使用 moment.js）
- **lodash** - 工具函数

### 禁止行为
- 禁止使用 class 组件
- 禁止直接使用 fetch/XMLHttpRequest（使用 `@umijs/max` 的 request）
- 禁止修改 `src/.umi/` 目录
- 禁止在 JSX 中写复杂的业务逻辑

## 代码组织规范

### 文件命名

| 类型 | 命名规则 | 示例 |
|------|---------|------|
| 组件文件 | PascalCase.tsx | `CustomIcon.tsx` |
| 工具文件 | camelCase.ts | `formatTime.ts` |
| 类型定义 | PascalCase.ts | `IPlatform.ts` |
| 常量文件 | UPPER_CASE.ts | `API_CONFIG.ts` |
| 样式文件 | style.less 或 index.less | - |

### 组件结构

```
ComponentName/
├── index.tsx          # 主组件
├── service.ts         # API 调用（如果有）
├── style.less         # 样式
├── hooks/             # 组件级 hooks（如果有）
└── components/        # 子组件（如果有）
```

### 导入顺序

```typescript
// 1. 外部库
import React, { useState } from 'react';
import { Button } from 'antd';
import dayjs from 'dayjs';

// 2. 内部组件/工具（使用 @ 别名）
import { CustomIcon } from '@/components/CustomIcon';
import { formatTime } from '@/utils/common';

// 3. 类型导入
import type { IPlatform } from '@/interface';

// 4. 相对路径导入
import { SubComponent } from './components/SubComponent';
```

## 编码规范

### 组件编写

```typescript
// ✅ 推荐：函数式组件 + Hooks
import React, { useState } from 'react';
import { Button } from 'antd';

const MyComponent: React.FC<Props> = ({ title }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await someAsyncAction();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-component">
      <Button loading={loading} onClick={handleClick}>
        {title}
      </Button>
    </div>
  );
};

export default MyComponent;
```

### 类型定义

```typescript
// ✅ 接口以 I 开头
interface IUser {
  id: number;
  name: string;
}

// ✅ 组件 Props 类型
interface IMyComponentProps {
  title: string;
  loading?: boolean;  // 可选属性
  onSubmit: (data: any) => void;
}

// ✅ 枚举使用 PascalCase
enum Status {
  Success = 'success',
  Failed = 'failed',
}
```

**类型使用原则：**
- 公共组件、工具函数 - 提供完整类型定义
- 业务接口返回数据 - 使用 `any` 即可（接口频繁变化，避免过度类型）
- 组件间传递的数据 - 根据复杂度决定，简单数据可用 `any`

### API 调用

```typescript
import { request } from '@umijs/max';

// ✅ 统一使用 request
export async function fetchData(params: any) {
  return request<any>(`${API_URL}/api/data`, {
    method: 'POST',
    data: params,
  });
}

// ✅ 使用时检查返回值
const response = await fetchData(params);
if (response?.ret === 1) {
  // 处理成功
} else {
  // 处理失败
}
```

### 状态管理

```typescript
// ✅ 跨页面状态使用 UmiJS model
// src/models/global.ts
export default () => {
  const [data, setData] = useState<any[]>([]);

  const fetchData = async () => {
    const res = await getData();
    if (res?.ret === 1) {
      setData(res.result || []);
    }
  };

  return { data, fetchData };
};

// 组件中使用
const { data, fetchData } = useModel('global');

// ✅ 页面内状态使用 useState
const [loading, setLoading] = useState(false);

// ✅ 从URL中获取/设置查询参数
const [searchParams, setSearchParams] = useUrlState(undefined, { navigateMode: 'replace' });
```

### 样式规范

```typescript
// ✅ 使用 className 引用样式
import styles from './style.less';

<div className={styles.container}>
  <span className={styles.text}>Hello</span>
</div>

// ✅ 简单动态样式使用 style 属性
<div style={{ color: active ? '#1890ff' : '#999' }}>

// ❌ 避免复杂的内联样式
<div style={{ display: 'flex', flexDirection: 'column', ... }}>
```

## 命名规范

| 场景 | 规则 | 示例 |
|------|------|------|
| React 组件 | PascalCase | `MyComponent`, `CustomButton` |
| 普通函数 | camelCase | `handleClick`, `formatTime` |
| 变量 | camelCase | `userName`, `isLoading` |
| 常量 | UPPER_SNAKE_CASE | `API_URL`, `MAX_COUNT` |
| 接口 | I + PascalCase | `IUser`, `IData` |
| 类型 | PascalCase | `Props`, `Response` |
| 枚举 | PascalCase | `Status`, `Type` |
| 类 | PascalCase | `Service`, `Utils` |

### 事件处理函数

```typescript
// ✅ 使用 handle 前缀
const handleClick = () => { };
const handleSubmit = (data: any) => { };
const handleChange = (value: string) => { };

// ✅ 异步函数使用 fetch/get/save/update 等动词
const fetchUserData = async () => { };
const saveSettings = async () => { };
```

## 常用模式

### 组件初始化

**使用 ahooks 的 `useMount` 进行组件初始化，语义更清晰。**

```typescript
import { useMount } from 'ahooks';

// ✅ 推荐：使用 useMount 进行初始化
useMount(() => {
  fetchData();
  initForm();
});

// ❌ 避免：使用 useEffect + 空依赖
useEffect(() => {
  fetchData();
}, []); // 这种写法语义不清晰
```

**常用 ahooks：**
- `useMount` - 组件挂载时执行（初始化）
- `useUnmount` - 组件卸载时执行（清理）
- `useMemoizedFn` - 缓存函数引用
- `useLocalStorageState` - 本地存储状态
- `useUpdateEffect` - 跳过首次执行的 useEffect

### 数据处理

**使用 lodash 进行数据处理，提供更好的容错性和边界处理。**

```typescript
import { isEmpty, isNil, map, keyBy, entries, round, trim } from 'lodash';

// ✅ 推荐：使用 lodash 处理数据
const deviceMap = keyBy(deviceList, 'id');  // 转为对象映射
const entriesList = entries(obj);            // 对象转数组
const trimmedStr = trim(inputStr);          // 去除首尾空格
const roundedNum = round(number, 2);       // 保留小数

// ✅ 容错判断
if (isEmpty(data)) { }      // 判断空数组/空对象/空字符串
if (isNil(value)) { }        // 判断 null 或 undefined
```

**常用 lodash：**
- `isEmpty`, `isNil`, `isUndefined` - 判断
- `map`, `filter`, `entries`, `keyBy` - 数据转换
- `round`, `trim` - 字符串和数字处理

### 表格搜索

```typescript
// ✅ 使用 common.tsx 中的 getColumnSearchProps
import { getColumnSearchProps } from '@/utils/common';

<Table
  columns={[
    {
      title: '名称',
      dataIndex: 'name',
      ...getColumnSearchProps('name'),
    },
  ]}
/>
```

### 时间处理

```typescript
// ✅ 使用 dayjs
import dayjs from 'dayjs';

// 格式化
const timeStr = dayjs(timestamp).format('YYYY/MM/DD HH:mm:ss');

// 相对时间
const diff = dayjs().diff(dayjs(timestamp), 'day');
```

### 列表分页

**默认情况下后端不做分页，不需要传分页参数。**

只有在明确说明"支持分页"的情况下，才按分页处理：

```typescript
// ⚠️ 仅在明确支持分页时使用
const [pagination, setPagination] = useState({
  current: 1,
  pageSize: 20,
});

const handleTableChange = (pageInfo: any) => {
  setPagination({
    current: pageInfo.current,
    pageSize: pageInfo.pageSize,
  });
};

<Table
  pagination={{
    current: pagination.current,
    pageSize: pagination.pageSize,
    showSizeChanger: true,
    showQuickJumper: true,
  }}
  onChange={handleTableChange}
/>
```

### 表单处理

```typescript
// ✅ 使用 Ant Design Form
import { Form, Input, Button } from 'antd';

const [form] = Form.useForm();

const handleSubmit = async (values: any) => {
  try {
    await submitData(values);
  } catch (error) {
    // 请求失败
  }
};

<Form form={form} onFinish={handleSubmit}>
  <Form.Item name="name" label="名称" rules={[{ required: true }]}>
    <Input placeholder="请输入名称" />
  </Form.Item>
  <Button type="primary" htmlType="submit">
    提交
  </Button>
</Form>
```

### 图表组件

**项目默认使用 echarts-for-react + echarts 方案。**

```typescript
// ✅ 使用 echarts-for-react
import React from 'react';
import ReactECharts from 'echarts-for-react';

const MyChart: React.FC = () => {
  const option = {
    xAxis: {
      type: 'category',
      data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        data: [120, 200, 150, 80, 70, 110, 130],
        type: 'line',
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: 400 }}
      notMerge
      lazyUpdate
    />
  );
};

export default MyChart;
```

**注意事项：**
- 图表容器必须设置高度
- 使用 `notMerge` 和 `lazyUpdate` 提升性能
- 动态数据更新时，直接传入新的 `option` 即可

## 错误处理

```typescript
// ✅ 使用 message 提示
import { message } from 'antd';

try {
  await someAsyncAction();
  message.success('操作成功');
} catch (error) {
  message.error('操作失败');
}

// ✅ 异步请求默认添加 loading
const [loading, setLoading] = useState(false);

const handleAction = async () => {
  setLoading(true);
  try {
    await someAsyncAction();
  } finally {
    setLoading(false);
  }
};
```

## 代码质量约束

### 禁止的操作
- ❌ 禁止在 JSX 中使用 `eval()` 或 `Function()`
- ❌ 禁止使用魔法数字，使用常量代替
- ❌ 禁止在组件中写过多的业务逻辑，抽取到 utils 或 hooks

### 遵循的原则
- ✅ 单一职责：每个函数只做一件事
- ✅ 可读性优先：代码应该像文档一样可读
- ✅ 公共组件/函数有类型定义，业务接口可用 any
- ✅ 错误处理：所有异步操作都要处理错误

## 组件复用

### 优先使用现有组件

在创建新组件前，先检查 `src/components/` 目录，优先复用已有组件。

### 组件复用原则

- 当组件在超过 2 个页面使用时，考虑提取到 `src/components/`
- 页面内多次使用的组件，提取到页面的 `components/` 目录
- 组件应该通过 props 接收所有配置，避免依赖全局状态

## 路由规范

### 路由配置位置

所有路由配置在 `config/config.ts` 的 `routes` 数组中。

### 路由结构

```typescript
{
  name: '页面名称',
  path: '/project/:project/pageName',
  component: './PageName',
  access: 'canRead',           // 权限控制
  icon: 'IconName',             // 菜单图标
  hideInMenu: false,            // 是否在菜单中隐藏
}
```

### 权限控制

- 普通页面使用 `access: 'canRead'`
- 管理页面使用 `access: 'canSuperUser'`
- 使用 `useAccess()` hook 在组件中获取权限

## 环境变量

### 使用环境变量

```typescript
// ✅ API 地址
const API_URL = process.env.API_URL;

// ✅ 认证配置
const { AUTH_CONFIG } = window as any;

// ✅ 在 config.ts 中定义全局变量
define: {
  API_URL: 'https://api.example.com',
}
```

### 环境区分

- `local` - 本地开发环境
- `develop` - 开发测试环境
- `prd` - 生产环境

对应的配置文件：`config.{env}.ts`

## 注意事项

1. **务实类型** - 公共组件/函数有类型定义，业务接口灵活使用 any
2. **代码格式化** - 提交前运行 `npm run format`
3. **文件大小** - 单个组件文件不超过 500 行，超过则拆分
4. **性能考虑** - 列表使用虚拟滚动，大列表考虑分页
5. **无需 tsc 检查** - 不需要运行 TypeScript 类型检查，费时费力
6. **无国际化** - 项目不需要支持国际化，用户可见文本直接中文即可
7. **列表默认无分页** - 除非明确说明支持分页，否则后端不做分页

## Git 提交规范

提交信息格式：

```
feat: 新增功能
fix: 修复问题
style: 样式调整
refactor: 代码重构
docs: 文档更新
test: 测试相关
chore: 构建/工具相关
```

示例：
```
feat: 新增任务导出功能
fix: 修复流水线执行历史分页问题
style: 调整表格列宽显示
```
