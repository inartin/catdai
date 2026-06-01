import { memo } from "react";

const Icon = ({ size = 20, width, height, ...props }) => (
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
      d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
      fill={props.fill ?? "none"}
      stroke={props.stroke ?? "currentColor"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <path
      d="M8 9h8M8 13h5"
      fill="none"
      stroke={props.stroke ?? "currentColor"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

export default memo(Icon);
