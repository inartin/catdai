import { memo } from "react";

const Icon = ({ size = 16, width, height, ...props }) => (
    <svg
        aria-hidden="true"
        focusable="false"
        height={size || height}
        role="presentation"
        viewBox="0 0 22 22"
        width={size || width}
        {...props}
    >
        <path
            d="M18 6L6 18M6 6l12 12"
            stroke={props.stroke ?? "currentColor"}
            fill={props.fill ?? "none"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

export default memo(Icon);
