# 三维医学影像体渲染与ROI标注平台

基于Vue 3 + FastAPI的医学影像分析工具，DICOM/NIfTI解析、Three.js体渲染(Raycasting)、ROI标注、窗宽窗位、多平面重建。

## 目标用户
放射科医生、医学影像研究者、生物医学工程师

## 技术栈
- 前端: Vue 3 + TypeScript + Vite + Pinia + Element Plus + Three.js
- 后端: Python FastAPI + NumPy + SciPy + SimpleITK

## 核心功能
1. DICOM/NIfTI文件解析：读取体素数据、尺寸、间距、窗宽窗位元信息
2. Three.js体渲染：Raycasting光线步进算法分段渲染(皮肤/骨骼/软组织)、传输函数颜色映射
3. ROI感兴趣区域标注：绘制椭圆/矩形/多边形，记录解剖位置标签
4. CT窗宽窗位动态调节：预设窗(肺窗/纵隔窗/骨窗/脑窗)+手动调窗，实时更新渲染
5. 多平面重建(MPR)三视图：横断面(轴位)+冠状面+矢状面同步联动滑块
6. 体素统计：ROI内均值/标准差/最小/最大/直方图分布
