import Landing from '../pages/Landing'

export default [
  { path: '/', element: <Landing /> },
  {
    path: '*',
    element: <div>404 - Page not found</div>,
  },
]
