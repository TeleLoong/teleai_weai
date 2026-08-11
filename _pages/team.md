---
layout: team
title: 研究团队
permalink: /team/
nav: true
nav_order: 1
description: 团队成员信息。
hide_page_header: true
main_container_class: "container-fluid px-0 mt-0"

# Team page editable content guide:
# - Edit all team content in `team.*` below.
# - `team.liquid` only controls layout and rendering structure.
# - Use existing image paths under `assets/img/`.

team:
  defaults:
    links:
      - label: Homepage
        url: https://example.com
      - label: Google Scholar
        url: https://scholar.google.com/
  featured_ids:
    - pi
    - member_a
    - member_b
    - member_c
  lead:
    id: pi
    name: "孙哲"
    role: TeleAI研究科学家（双聘）、PI
    subtitle: "西北工业大学副教授"
    image: assets/team/sun-laoshi.jpg
    links:
      - label: Homepage
        url: https://teacher.nwpu.edu.cn/2022010060.html
      - label: Google Scholar
        url: https://scholar.google.com/citations?hl=en&user=i2TQSssAAAAJ&view_op=list_works&sortby=pubdate
    bio: >
      德国耶拿大学博士后，亥姆霍兹研究所博士后。研究方向为涉水光学成像探测、涉水具身智能技术研究
  groups:
    - id: teachers
      title: 全职（研究员/工程师）
      members:
        - id: teacher_zhengye
          name: 郑 高级研究员
          subtitle: 算法开发
          image: assets/team/zhengye.jpg
          bio: >
            高级研究员，浙江大学博士，主要负责算法开发。曾任中国航空无线电电子研究所应用技术研究师。研究方向为计算机视觉、无人机视觉
        - id: teacher_yaokanzhong
          name: 姚 高级研究员
          subtitle: 算法开发
          image: assets/team/yaokanzhong.jpg
          bio: >
            高级研究员，主要负责算法开发。英国曼彻斯特大学博士，曾任英国原子能机构、日本原子能机构 Fellow。 研究方向为多机器人系统在极端环境下的协同控制与感知
        - id: teacher_wangyoudong
          name: 王 高级工程师
          subtitle: 结构设计
          image: assets/team/wangyoudong.jpg
          bio: >
            高级工程师，主要负责结构设计。中国海洋大学硕士，曾任青岛国实智能装备科技有限公司、青岛崂山实验室结构工程师。研究方向为水下机器人结构设计
        - id: teacher_chenyifan
          name: 陈 博士后
          subtitle: 人工智能
          image: assets/team/chenyifan.jpg
          bio: >
            中国电信人工智能研究院（TeleAI）/复旦大学博士后，西北工业大学博士，主要负责算法开发。研究方向为计算机视觉
        - id: teacher_biyuanbo
          name: 毕 高级研究员
          subtitle: 算法开发
          image: assets/team/biyuanbo.jpg
          bio: >
            高级研究员，主要负责算法开发。上海交通大学博士。研究方向为海空两栖航行器设计与跨域策略
        - id: teacher_wangjiaguo
          name: 王 高级工程师
          subtitle: 强化学习
          image: assets/team/wangjiaguo.jpg
          bio: >
            高级工程师，西北工业大学博士，帝国理工学院硕士，主要从事强化学习及机器人/无人机系统硬件研发。研究方向为机器人与无人机系统硬件研发
        - id: teacher_pengzimeng
          name: 彭 高级工程师
          subtitle: 机器人设计
          image: assets/team/pengzimeng.jpg
          bio: >
            高级工程师，北京航空航天大学硕士，曾任中国航空无线电电子研究所工程师。研究方向为水下机器人系统设计
        - id: teacher_liyuliang
          name: 李 高级工程师
          subtitle: 光学感知与成像
          image: assets/team/liyuliang.jpg
          bio: >
            高级工程师，主要负责水下光学感知与成像。浙江大学海洋学院与东海实验室博士后，中国科学院上海光学精密机械研究所博士。研究方向为水下激光关联成像、低慢小目标光电探测与跟踪
        - id: teacher_jiangzhengyi
          name: 蒋 高级研究员
          subtitle: 机器人设计
          image: assets/team/jiangzhengyi.jpg
          bio: >
            高级研究员，主要负责机器人设计，英国曼彻斯特大学博士及博士后，曾任英国及日本原子能机构 Fellow、英国Ice Nine Robotics高级工程师。主要从事核退役及极端环境机器人和自动化装备的研发。
    - id: phd
      title: 博士研究生
      members:
        - id: member_a
          name: 王同学
          subtitle: 浙江大学
          bio: 机器人运控与导航
        - id: member_b
          name: 江同学
          subtitle: 复旦大学
          bio: 事件相机、水下多模态感知
        - id: member_d
          name: 宋同学
          subtitle: 中国科学技术大学
          bio: 具身操作、人机共享控制
        - id: member_g
          name: 李同学
          subtitle: 浙江大学
          bio: 涉水视觉与机器人
        - id: member_h
          name: 陈同学
          subtitle: 中国科学技术大学
          bio: 空海跨域
        - id: member_i
          name: 鲁同学
          subtitle: 上海交通大学
          bio: 散射成像
        - id: member_j
          name: 刘同学
          subtitle: 中国科学技术大学
          bio: 人机交互、水下视觉感知与控制
        - id: member_k
          name: 仇同学
          subtitle: 西北工业大学
          bio: 水下视觉、水下机械臂
    - id: ms
      title: 硕士研究生
      members:
        - id: member_c
          name: 赵同学
          subtitle: 西北工业大学
          bio: 嵌入式开发、水下激光探测
        - id: member_e
          name: 肖同学
          subtitle: 西北工业大学
          bio: 跨介质目标跟踪
    - id: ug
      title: Undergraduate
      members: []
  alumni_groups: []
---

<!-- 可选：在这里写团队页补充说明（Markdown）。 -->
