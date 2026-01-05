import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  return (
    <nav className="flex flex-col sticky top-0">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `
          px-5 py-4 text-sm font-medium no-underline
          border-l-4 transition-all duration-200
          ${isActive
            ? 'border-l-sky-500 bg-sky-50 text-sky-700'
            : 'border-l-transparent text-gray-700 hover:bg-gray-100'
          }
        `}
      >
        履修登録
      </NavLink>
      <NavLink
        to="/transcripts"
        className={({ isActive }) => `
          px-5 py-4 text-sm font-medium no-underline
          border-l-4 transition-all duration-200
          ${isActive
            ? 'border-l-sky-500 bg-sky-50 text-sky-700'
            : 'border-l-transparent text-gray-700 hover:bg-gray-100'
          }
        `}
      >
        履修記録
      </NavLink>
      {/* <NavLink
        to="/profile"
        className={({ isActive }) => `
          px-5 py-4 text-sm font-medium no-underline
          border-l-4 transition-all duration-200
          ${isActive
            ? 'border-l-sky-500 bg-sky-50 text-sky-700'
            : 'border-l-transparent text-gray-700 hover:bg-gray-100'
          }
        `}
      >
        プロフィール (将来追加)
      </NavLink> */}
    </nav>
  );
}
