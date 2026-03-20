import { memo } from "react";

// Memoize individual components
const MemoizedArrowDown = memo(({
    size = 24,
    width,
    height,
    ...props
}) => {
    return (
        <svg
            height={size || height}
            viewBox="0 0 512 512"
            width={size || width}
            {...props}
        >
            <path
                clipRule="evenodd"
                d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.8 224 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 306.7L54.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"
                fill={props.fill ?? "currentColor"}
                fillRule="evenodd"
            />
        </svg>
    );
});
MemoizedArrowDown.displayName = 'MemoizedArrowDown';

const MemoizedArrowUp = memo(({
    size = 24,
    width,
    height,
    ...props
}) => {
    return (
        <svg
            height={size || height}
            viewBox="0 0 512 512"
            width={size || width}
            {...props}
        >
            <path
                clipRule="evenodd"
                d="M214.6 41.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 141.2 160 448c0 17.7 14.3 32 32 32s32-14.3 32-32l0-306.7L329.4 246.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z"
                fill={props.fill ?? "currentColor"}
                fillRule="evenodd"
            />
        </svg>
    );
});
MemoizedArrowUp.displayName = 'MemoizedArrowUp';

const MemoizedArrowLeft = memo(({
    size = 24,
    width,
    height,
    ...props
}) => {
    return (
        <svg
            height={size || height}
            viewBox="0 0 512 512"
            width={size || width}
            {...props}
        >
            <path
                clipRule="evenodd"
                d="M41.4 297.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L141.2 352H448c17.7 0 32-14.3 32-32s-14.3-32-32-32H141.2l105.5-105.5c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"
                fill={props.fill ?? "currentColor"}
                fillRule="evenodd"
            />
        </svg>
    );
});
MemoizedArrowLeft.displayName = 'MemoizedArrowLeft';

const MemoizedArrowRight = memo(({
    size = 24,
    width,
    height,
    ...props
}) => {
    return (
        <svg
            height={size || height}
            viewBox="0 0 512 512"
            width={size || width}
            {...props}
        >
            <path
                clipRule="evenodd"
                d="M470.6 342.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L370.8 288H64c-17.7 0-32 14.3-32 32s14.3 32 32 32h306.7l-105.5 105.5c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"
                fill={props.fill ?? "currentColor"}
                fillRule="evenodd"
            />
        </svg>
    );
});
MemoizedArrowRight.displayName = 'MemoizedArrowRight';

// Named exports for individual arrow components
export const ArrowDown = MemoizedArrowDown;
export const ArrowUp = MemoizedArrowUp;
export const ArrowLeft = MemoizedArrowLeft;
export const ArrowRight = MemoizedArrowRight;

// Default export as an object containing all arrows
const Arrows = {
    ArrowDown: MemoizedArrowDown,
    ArrowUp: MemoizedArrowUp,
    ArrowLeft: MemoizedArrowLeft,
    ArrowRight: MemoizedArrowRight
};

export default Arrows;
