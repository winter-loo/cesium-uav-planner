# 视锥体实现说明

本文说明 `cesium-uav-planner` 中“选中航点视锥辅助”是如何实现的，包括：

1. 视锥的线框和填充面是怎么做的
2. 为什么最初 `pitch` 看起来不符合直觉
3. 后来是如何修复相机俯仰角，让 `pitch=0` 更符合用户理解的
4. 根部朝向箭头 / 中心线是怎么加上的

---

## 1. 相关文件

当前实现主要分散在以下文件：

- `src/App.tsx`
  - 负责把选中航点的相机参数转成 Cesium 视锥并渲染到场景中
  - 负责渲染根部朝向箭头
- `src/frustum-display.ts`
  - 负责创建“带面 + 线框”的视锥显示对象
- `src/frustum-orientation.ts`
  - 负责把航点相机的 `heading / pitch / roll` 转换成更符合直觉的视锥朝向 quaternion
- `src/frustum-direction-indicator.ts`
  - 负责生成视锥根部的朝向箭头 / 中心线端点
- 测试文件：
  - `src/frustum-display.test.ts`
  - `src/frustum-orientation.test.ts`
  - `src/frustum-direction-indicator.test.ts`

---

## 2. 视锥体的框和面是怎么实现的

### 2.1 一开始为什么只有线框

最初视锥使用的是 Cesium 的：

- `FrustumOutlineGeometry`

这个几何体只负责绘制轮廓，因此视觉上只有一个线框。

---

### 2.2 如何加上填充面

后来把视锥拆成两层来画：

1. **填充层**：`FrustumGeometry`
2. **轮廓层**：`FrustumOutlineGeometry`

对应实现在 `src/frustum-display.ts`。

核心思路是：

```ts
fillInstance -> FrustumGeometry
outlineInstance -> FrustumOutlineGeometry
```

这样可以同时保留：

- 半透明体积感
- 清晰边线

---

### 2.3 填充层的实现

填充层使用：

- `FrustumGeometry`
- `PerInstanceColorAppearance`

并配置：

- `translucent: true`
- `closed: true`
- `flat: true`

其中：

- `translucent: true` 让视锥面半透明
- `closed: true` 告诉 Cesium 这是封闭体，按实体面来处理
- `flat: true` 让显示更像辅助工具，而不是受复杂光照影响的实体模型

填充颜色目前是：

```ts
#d58936 + alpha 0.18
```

也就是一个较淡的橙色半透明锥体。

---

### 2.4 线框层的实现

线框层继续使用：

- `FrustumOutlineGeometry`
- `PerInstanceColorAppearance`

并保留更高的不透明度，方便在地图背景上辨认边界。

当前线框颜色是：

```ts
#d58936 + alpha 0.9
```

所以最终视觉上是：

- 里面有一层淡橙色实体面
- 外面有一个更清晰的橙色轮廓框

---

### 2.5 在场景里如何挂载

在 `src/App.tsx` 中，选中某个 waypoint 之后会：

1. 从该航点读出相机参数
2. 创建 `PerspectiveFrustum`
3. 创建朝向 quaternion
4. 调用 `createFrustumDisplay({ origin, orientation, frustum })`
5. 分别把 fill primitive 和 outline primitive 加到 `viewer.scene.primitives`

之所以使用 `Primitive` 而不是普通 entity，是因为 `FrustumGeometry / FrustumOutlineGeometry` 这一类底层几何更适合直接走 primitive 渲染链路。

---

## 3. 视锥参数是怎么映射的

每个 waypoint 都有自己的相机参数，定义在 `src/camera.ts` 中：

- `heading`
- `pitch`
- `roll`
- `fov`
- `range`
- `aspectRatio`

在渲染时，这些参数被映射到 Cesium 的 `PerspectiveFrustum`：

- `fov` -> 视场角
- `aspectRatio` -> 宽高比
- `near` -> 固定为 `1`
- `far` -> 使用 `camera.range`

也就是说，用户在 UI 里调：

- FOV：改变张角
- range：改变视锥长度
- heading / pitch / roll：改变方向

---

## 4. 为什么最初的 pitch 看起来不符合直觉

### 4.1 现象

最初用户发现：

- 当 `pitch = 0` 时
- 远端裁切面看起来并不是“水平向前”
- 反而像是最接近用户、或者像绕局部 Z 轴 / up 方向在表现

这会让人觉得：

- 视锥不是在沿相机前向移动
- 而是在按某个不直观的本地坐标系解释 `pitch`

---

### 4.2 根因

最初的实现是直接把：

```ts
Transforms.headingPitchRollQuaternion(origin, hpr)
```

得到的 quaternion 传给 `FrustumGeometry`。

问题在于：

- `Transforms.headingPitchRollQuaternion(...)`
  的语义是“在局部 ENU 参考系里，根据 heading/pitch/roll 生成姿态”
- `FrustumGeometry` 对 `orientation` 的解释则更接近“相机的 right / up / direction 列向量组成的旋转矩阵”

这两个 API 虽然都叫 orientation，但**轴语义并不完全等价**。

结果就是：

- 直接把前者喂给后者
- 在某些角度下会产生不符合用户直觉的 forward 方向
- 尤其 `pitch=0` 时，不一定是用户理解的“水平朝前”

---

## 5. 如何修复 pitch，让它更符合用户直觉

### 5.1 修复目标

修复后的目标语义是：

- `heading = 0` -> 朝北
- `heading = 90` -> 朝东
- `pitch = 0` -> 水平看
- `pitch < 0` -> 向下看
- `pitch > 0` -> 向上看

这是大多数用户在航拍 / 云台控制场景下最直观的理解。

---

### 5.2 修复思路

修复方法不是再去“猜” Cesium 内部如何解释这个 quaternion，
而是直接自己把视锥真正需要的三个轴算出来：

- `direction`
- `up`
- `right`

然后再用这三个轴组装 `FrustumGeometry` 需要的 rotation matrix。

实现文件：`src/frustum-orientation.ts`

---

### 5.3 具体数学步骤

#### 第一步：取 waypoint 所在位置的 ENU 坐标系

先通过：

```ts
Transforms.eastNorthUpToFixedFrame(origin)
```

拿到该位置局部坐标系的三个基向量：

- `east`
- `north`
- `up`

这一步的意义是：

- 不直接依赖某个隐式相机坐标语义
- 明确地从地理位置出发建立局部方向基底

---

#### 第二步：根据 heading 计算水平前向

在水平面内，前向向量由 `north` 和 `east` 线性组合得到：

```ts
horizontalDirection = north * cos(heading) + east * sin(heading)
```

这样可保证：

- `heading=0` 时是 north
- `heading=90°` 时是 east

---

#### 第三步：计算未俯仰时的右向量

基于水平前向与 `up` 做叉积，得到水平右向量：

```ts
leveledRight = cross(horizontalDirection, up)
```

并归一化。

---

#### 第四步：把 pitch 融入 direction

再把 pitch 加入前向：

```ts
direction = horizontalDirection * cos(pitch) + up * sin(pitch)
```

因为我们当前采用的用户语义是：

- 正 pitch 向上
- 负 pitch 向下

所以：

- `pitch = 0` -> 只剩水平前向
- `pitch = -45°` -> 同时包含水平前向和向下分量

这正是用户想要的“俯视地面”的感觉。

---

#### 第五步：根据 direction 与 right 反推出 up

为了保证三个轴正交，再计算：

```ts
unrolledUp = cross(leveledRight, direction)
```

这样得到与新的 direction 对应的 up。

---

#### 第六步：把 roll 作为绕 direction 的旋转

如果用户设置了 `roll`，则围绕当前 `direction` 再做一次轴角旋转：

```ts
Quaternion.fromAxisAngle(direction, roll)
```

然后把：

- `right`
- `up`

都旋转过去。

---

#### 第七步：按 FrustumGeometry 期待的列向量顺序组装旋转矩阵

最终把三个轴塞回矩阵：

- 第 0 列：`-right`
- 第 1 列：`up`
- 第 2 列：`direction`

再：

```ts
Quaternion.fromRotationMatrix(rotation)
```

生成最终的 `orientation`。

这一步是修复的关键。

不是简单“改个 pitch 符号”，而是**把 orientation 语义显式转换成 FrustumGeometry 真正需要的相机轴系**。

---

## 6. 这个修复是如何验证的

### 6.1 方向测试

在 `src/frustum-orientation.test.ts` 中增加了测试，验证：

1. `heading=0, pitch=0`
   - direction 对齐 local north
   - direction 与 up 正交
2. `heading=90, pitch=0`
   - direction 对齐 local east
3. `heading=0, pitch=-45`
   - direction 的 north 分量接近 `cos(45°)`
   - direction 的 up 分量接近 `-sin(45°)`

这些测试的意义是：

- 不是只看“画面感觉差不多”
- 而是明确验证局部 ENU 坐标系下的几何方向

---

### 6.2 渲染层测试

`src/frustum-display.test.ts` 验证了：

- fill 用的是 `FrustumGeometry`
- outline 用的是 `FrustumOutlineGeometry`
- fill appearance 是 `closed: true`
- outline appearance 仍然保持线框语义

---

## 7. 根部朝向箭头 / 中心线是怎么实现的

为了让用户更直接看出“云台镜头当前朝哪”，后来又加了一个朝向箭头。

实现文件：`src/frustum-direction-indicator.ts`

### 7.1 实现思路

做法很简单：

1. 从视锥 `orientation` 中取第 2 列，也就是 `direction`
2. 从 `origin` 沿这个方向前进一段距离
3. 得到两点：
   - 起点：`origin`
   - 终点：`origin + direction * length`

最后把这两点作为一条 polyline entity 画出来。

---

### 7.2 为什么它和视锥方向一致

因为箭头直接复用了和视锥相同的 `orientation`，并且取的是同一个 `direction` 轴。

因此它不是“独立猜出来的一条线”，而是：

- 与视锥完全共享方向定义
- 可以作为视锥的中心线 / 朝向提示

---

### 7.3 长度控制

箭头长度在 helper 里做了 clamp：

- 最短：`8`
- 最长：`120`

在 `App.tsx` 中，默认传入的是：

```ts
camera.range * 0.32
```

这样：

- 近距离视锥不会短得看不见
- 远距离视锥也不会长到严重干扰画面

---

### 7.4 渲染样式

箭头渲染使用的是 Cesium entity polyline：

- `PolylineArrowMaterialProperty`
- `ArcType.NONE`
- `clampToGround: false`

当前颜色为：

```ts
#ef4444 + alpha 0.95
```

视觉上它是一条红色箭头线，从视锥根部沿中心方向伸出。

---

## 8. 当前整体流程总结

选中某个航点后，当前渲染链路如下：

1. 从 waypoint 读取 `camera` 参数
2. 用 `PerspectiveFrustum` 生成视锥体积参数
3. 用 `createFrustumOrientation(...)` 把 `heading / pitch / roll` 转成更直观的相机姿态
4. 用 `createFrustumDisplay(...)` 生成：
   - 填充 primitive
   - 轮廓 primitive
5. 用 `createFrustumDirectionIndicator(...)` 生成根部朝向箭头
6. 把这些对象分别挂到 Cesium scene / entities 中

最终用户看到的是：

- 有面、有轮廓的视锥
- 方向更符合直觉的 pitch 行为
- 视锥根部带一个清晰的中心朝向箭头

---

## 9. 后续可扩展方向

如果后面还要继续增强，这套实现可以继续往下扩展：

1. **箭头颜色与视锥统一**
   - 现在箭头是红色，视锥是橙色
   - 可以改成同一主题色

2. **在箭头末端加瞄准点 / 十字标记**
   - 让相机中心落点更明确

3. **把 near / far 显式可视化**
   - 比如区分近裁切面和远裁切面颜色

4. **支持 aspectRatio 的 UI 调整**
   - 当前数据层已支持，UI 仍可继续开放给用户

5. **加入地面交点 / footprint 预测**
   - 在有 pitch 向下时，把视锥中心线和地面的交点显示出来

---

## 10. 验证状态

上述实现完成后，当前项目已通过：

- `npx vitest run`
- `npm run build`
- `npm run lint`

说明：

- 工具函数有测试覆盖
- TypeScript 构建通过
- 代码风格检查通过

---

## 11. 给 AI 用的大白话 Prompt 说明

这一节不是解释当前代码，而是告诉一个**完全不懂 Cesium 的新手**，怎样用尽量直白的话，把需求一次性讲给 AI，让 AI 更容易做出现在这个效果。

核心原则只有一句：

> **不要只说“帮我加一个视锥”。要把你希望用户怎么操作、画面上要看到什么、参数怎么理解、哪里容易出错，全部用大白话讲出来。**

---

### 11.1 新手最容易犯的 prompt 问题

如果只输入这种话：

```text
帮我在 Cesium 里给航点加个视锥。
```

AI 很容易只做出：

- 一个静态线框
- 不能编辑参数
- 没有填充面
- pitch 方向不符合直觉
- 也没有朝向箭头

因为这句话只说明了“要一个视锥”，但没有说明：

- 视锥是给**选中的航点**显示，还是所有航点都显示
- 视锥要不要带面
- 要不要可以编辑
- pitch 的直觉定义是什么
- 要不要额外朝向辅助
- 要不要写测试

所以，**新手想让 AI 做对，最重要的不是术语，而是把使用效果说清楚。**

---

### 11.2 最推荐的新手版 Prompt

下面这段 prompt，适合一个不懂 Cesium 的人直接复制给 AI：

```text
我有一个 React + TypeScript + Cesium 项目。

请帮我给“当前选中的航点”增加一个可视化相机视锥辅助，并且让我可以通过调整视锥对应的参数，来调整无人机云台相机的方向。

我要的效果请按下面实现：

1. 只有在用户选中某个航点时，才显示这个航点的视锥。
2. 每个航点都要保存自己的相机参数，至少包括：heading、pitch、roll、fov、range、aspectRatio。
3. 视锥不要只有线框，我要“半透明的面 + 清晰的轮廓线”，这样更直观。
4. 用户要能在界面里直接编辑 heading、pitch、fov、range。
5. heading 的语义要符合直觉：0 度朝北，90 度朝东。
6. pitch 的语义也要符合直觉：0 度表示水平看，负数表示向下看，正数表示向上看。
7. 请注意不要直接套一个看起来能用的 orientation API 就结束，因为 Cesium 里某些 orientation 和 FrustumGeometry 的轴语义可能不一致。请保证最终效果真的是“pitch=0 水平、负值向下”。
8. 请在视锥根部再加一条朝向箭头或中心线，让我更容易看出相机正前方朝哪。
9. 请把 Cesium 相关数学和显示逻辑拆成小模块，不要全部塞进 App.tsx。
10. 请为关键逻辑写测试，至少覆盖：
   - 视锥填充层和轮廓层的创建
   - heading / pitch 的方向语义
   - 根部朝向箭头的方向和长度
11. 最后请确保项目通过：npx vitest run、npm run build、npm run lint。

如果你发现 Cesium 的默认 orientation 行为会让 pitch 不符合人的直觉，请你自己修正，不要把错误行为原样保留。

请直接给出你要修改的文件、代码实现和测试代码。
```

这个版本的优点是：

- 不要求提问者懂 `FrustumGeometry`
- 不要求提问者懂四元数
- 但已经把“交互效果”和“正确语义”说清楚了

这对 AI 来说，比一句“加个视锥”有效很多。

---

### 11.3 更口语化、像产品经理说话的版本

如果你想写得更像大白话，而不是技术需求，可以这样说：

```text
我在做一个无人机航线规划页面，地图是 Cesium。
现在我希望：当我点中某一个航点时，地图上出现一个相机视野辅助区域。

这个辅助区域要像一个从航点位置打出去的“视锥”，而且不能只是几条线，我希望它有半透明的体积感，同时边缘轮廓要清楚。

我还希望在右侧或者航点卡片里可以直接改这个相机的朝向参数，比如朝哪个方向看、往上还是往下看、视野宽窄、看多远。

最重要的一点是，俯仰角一定要符合普通人的直觉：
- pitch = 0 的时候是水平往前看
- pitch < 0 的时候是往地面压下去看
- pitch > 0 的时候是往天上抬起来看

请不要做成那种数学上看似对、但用户看起来别扭的效果。

另外请在视锥根部加一条朝向箭头或中线，让人一眼知道镜头正前方在哪里。

请把实现拆分清楚：
- 航点相机参数单独管理
- 视锥显示单独封装
- 方向计算单独封装
- 箭头辅助单独封装

最后补上测试，并确保构建、lint、测试都通过。
```

这个版本适合：

- 自己不想写很多技术细节
- 但很清楚“用户看到什么才算对”

---

### 11.4 如果你想让 AI 少走弯路，还可以补这几句

下面这些补充句子非常有用：

```text
请先检查我项目里现在是怎么渲染航点和选中状态的，再接着改，不要凭空重写整个页面。
```

```text
如果你发现当前项目已经有 mission / waypoint / camera 数据结构，请优先在现有结构上扩展，不要重新发明一套数据模型。
```

```text
请优先做成纯函数 + 小模块，并补测试，不要把 Cesium 数学全写在一个 useEffect 里。
```

```text
如果某一步你不确定 Cesium 的 orientation 语义，请写一个最小测试或实验去验证，不要靠猜。
```

```text
请在最终说明里告诉我：哪些文件是新增的，哪些文件是修改的，为什么这样拆分。
```

这些补充句子会明显降低 AI：

- 大改架构
- 乱改现有 UI
- 用错误 orientation 凑效果
- 不写测试

的概率。

---

### 11.5 一个“分步骤让 AI 干活”的 Prompt 模板

如果你不想一次性给 AI 太多要求，也可以分 4 步提：

#### 第一步：先做最小可见效果

```text
请先不要一次性做完全部功能。
先在 Cesium 地图里，为当前选中的航点画出一个最基础的相机视锥辅助。
先实现：选中航点时显示视锥，不选中时隐藏。
并告诉我你准备把相机参数放到哪个数据结构里。
```

#### 第二步：再补“面 + 框”

```text
现在请把刚才的视锥从单纯线框升级为“半透明填充面 + 外轮廓线”，让我在地图里更容易看清空间范围。
```

#### 第三步：再修 pitch 语义

```text
现在请重点修正 pitch 的直觉语义。
我要的是：pitch=0 水平，负值向下，正值向上。
如果你发现直接使用 Cesium 某个默认 orientation API 会导致这个语义不对，请你自己重建 direction / up / right，不要保留错误行为。
```

#### 第四步：再补箭头和测试

```text
现在请在视锥根部加一个朝向箭头或中心线，并补上对应测试。
最后跑完整体验证命令并告诉我结果。
```

这种方式的好处是：

- AI 每次只处理一个目标
- 你更容易及时发现偏差
- 不容易在一个超长回复里埋错

---

### 11.6 适合写进需求里的“验收标准”

如果你想让 AI 最后交付结果更稳定，建议把下面这些验收标准也写进 prompt：

```text
验收标准：
1. 选中航点后能立即看到视锥。
2. 视锥同时有填充面和轮廓线。
3. 修改 heading / pitch / fov / range 后，地图中的视锥会实时变化。
4. pitch=0 时，视锥中心方向是水平向前。
5. pitch 为负时，视锥明显朝地面压下。
6. 视锥根部有明显朝向箭头或中心线。
7. 关键数学逻辑有测试。
8. npx vitest run、npm run build、npm run lint 全部通过。
```

AI 在看到“验收标准”时，通常会比只看模糊描述更容易做对。

---

### 11.7 一句话总结：新手到底该怎么提

如果你完全不懂 Cesium，也可以记住这个最短模板：

```text
请在我现有的 React + TypeScript + Cesium 项目里，为“选中的航点”增加一个可编辑的相机视锥辅助。
我要的不是只有线框，而是“半透明面 + 轮廓线”。
我要能直接调整 heading、pitch、fov、range。
其中 pitch 必须符合普通人直觉：0 水平，负值向下，正值向上。
请再加一个根部朝向箭头，并补测试，最后确保 vitest、build、lint 都通过。
```

这已经足够让 AI 做出和当前项目非常接近的效果。
