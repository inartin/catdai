import { memo } from "react";

const Icon = ({ size = 16, width, height, ...props }) => (
  <svg
    aria-hidden="true"
    focusable="false"
    height={size || height}
    role="presentation"
    viewBox="0 0 24 24"
    width={size || width}
    {...props}
  >
    <path
      d="M15 17H9m8-6V9a5 5 0 1 0-10 0v2L5 15v1h14v-1l-2-4zm-6 8a2 2 0 0 0 4 0"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default memo(Icon);
