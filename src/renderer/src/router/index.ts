import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/HomePage.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/w/:id',
    name: 'workspace',
    component: () => import('../pages/WorkspacePage.vue'),
    props: true,
    meta: { title: '工作区' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../pages/SettingsPage.vue'),
    meta: { title: '设置' }
  },
  {
    path: '/:catchAll(.*)',
    redirect: { name: 'home' }
  }
]

export const router = createRouter({
  // Electron 里用 hash 路由更稳，不跟 file:// 打架
  history: createWebHashHistory(),
  routes
})
