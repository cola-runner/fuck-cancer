// Line icons — soft 1.7 stroke, rounded caps. Shared via window.
const Ic = ({ d, size = 22, s = 1.7, fill = "none", stroke = "currentColor", children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth={s} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d ? <path d={d} /> : children}
  </svg>
);

const IconBack = (p) => <Ic {...p} d="M15 19l-7-7 7-7" s={2.2} />;
const IconPlus = (p) => <Ic {...p} d="M12 5v14M5 12h14" s={2.2} />;
const IconChevron = (p) => <Ic {...p} d="M9 5l7 7-7 7" s={2.2} />;
const IconHeart = (p) => <Ic {...p} d="M12 20.5C5 16 3 12.5 3 9.2 3 6.6 5 5 7.2 5c1.7 0 3 .9 3.8 2.2C11.8 5.9 13.1 5 14.8 5 17 5 19 6.6 19 9.2c0 3.3-2 6.8-7 11.3z" />;
const IconDoc = (p) => <Ic {...p} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5" />;
const IconPill = (p) => (
  <Ic {...p}>
    <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" />
    <path d="M12 8.7v6.6" />
  </Ic>
);
const IconGlobe = (p) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
  </Ic>
);
const IconSpark = (p) => (
  <Ic {...p} d="M12 3l1.8 4.9L18.8 9.7 13.8 11.5 12 16.4 10.2 11.5 5.2 9.7 10.2 7.9z" />
);
const IconSearch = (p) => (
  <Ic {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.2-3.2" />
  </Ic>
);
const IconSend = (p) => <Ic {...p} d="M5 12l14-7-5 7 5 7-14-7z" s={1.6} />;
const IconCheck = (p) => <Ic {...p} d="M5 12.5l4.5 4.5L19 7" s={2.2} />;
const IconExternal = (p) => (
  <Ic {...p} size={13} s={2}>
    <path d="M7 17L17 7M9 7h8v8" />
  </Ic>
);
const IconShield = (p) => (
  <Ic {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" s={1.6} />
  </Ic>
);
const IconLeaf = (p) => <Ic {...p} d="M5 19c0-7 5-13 14-13 0 9-6 14-14 13zM5 19c3-3 5-5 8-6.5" />;
const IconUser = (p) => (
  <Ic {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" />
  </Ic>
);

Object.assign(window, {
  IconBack, IconPlus, IconChevron, IconHeart, IconDoc, IconPill, IconGlobe,
  IconSpark, IconSearch, IconSend, IconCheck, IconExternal, IconShield, IconLeaf, IconUser,
});
