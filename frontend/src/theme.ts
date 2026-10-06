import { createTheme } from "@mui/material";

export const THEME_MODE_STORAGE_KEY = "symvolia:settings:theme";

// Type augmentation for custom theme tokens
declare module "@mui/material/styles" {
  interface Theme {
    custom: {
      appBar: {
        logoIcon: {
          size: {
            mobile: string;
            desktop: string;
          };
        };
        logoText: {
          size: {
            mobile: string;
            desktop: string;
          };
        };
        spacing: {
          mobile: number;
          desktop: number;
        };
      };
      statementList: {
        endIndicatorPadding: number;
      };
      layout: {
        contentGap: {
          mobile: number;
          desktop: number;
        };
      };
      sideNav: {
        width: number;
      };
      colors: {
        allocation: {
          allocated: string;
          unallocated: string;
          stagedIncrease: string;
          stagedDecrease: string;
        };
        credit: {
          light: string;
          main: string;
        };
        stagedSupport: {
          light: string;
          dark: string;
        };
      };
    };
  }
  interface ThemeOptions {
    custom?: {
      appBar?: {
        logoIcon?: {
          size?: {
            mobile?: string;
            desktop?: string;
          };
        };
        logoText?: {
          size?: {
            mobile?: string;
            desktop?: string;
          };
        };
        spacing?: {
          mobile?: number;
          desktop?: number;
        };
      };
      statementList?: {
        endIndicatorPadding?: number;
      };
      layout?: {
        contentGap?: {
          mobile?: number;
          desktop?: number;
        };
      };
      sideNav?: {
        width?: number;
      };
      colors?: {
        allocation?: {
          allocated?: string;
          unallocated?: string;
          stagedIncrease?: string;
          stagedDecrease?: string;
        };
        credit?: {
          light?: string;
          main?: string;
        };
        stagedSupport?: {
          light?: string;
          dark?: string;
        };
      };
    };
  }
}

export const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: "#4D7EA8",
        },
        secondary: {
          main: "#dc004e",
        },
        background: {
          default: "#F4F4F4",
        },
        text: {
          primary: "#323232ff",
        },
      },
    },
    dark: {
      palette: {
        primary: {
          main: "#4D7EA8",
        },
      },
    },
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
  },
  components: {
    MuiButton: {
      defaultProps: {
        variant: "contained",
        size: "small",
      },
      styleOverrides: {
        root: {
          textTransform: "none",
        },
      },
    },
    MuiAvatar: {
      defaultProps: {
        // Square avatars with softly rounded corners (no longer circular).
        variant: "rounded",
      },
      styleOverrides: {
        root: ({ theme }) => ({
          width: 40,
          height: 40,
          [theme.breakpoints.down("md")]: {
            width: 32,
            height: 32,
          },
        }),
      },
    },
    MuiStack: {
      defaultProps: {
        spacing: 2,
      },
    },
  },
  custom: {
    appBar: {
      logoIcon: {
        size: {
          mobile: "1.3rem",
          desktop: "1.5rem",
        },
      },
      logoText: {
        size: {
          mobile: "1.5rem",
          desktop: "1.625rem",
        },
      },
      spacing: {
        mobile: 1,
        desktop: 2,
      },
    },
    statementList: {
      endIndicatorPadding: 4,
    },
    layout: {
      contentGap: {
        mobile: 2,
        desktop: 4,
      },
    },
    sideNav: {
      width: 220,
    },
    colors: {
      // Support-allocation bar segments. Kept in distinct hue families so
      // segment boundaries stay legible even without a staged segment between.
      allocation: {
        allocated: "#2e7d32", // green
        unallocated: "#749fc4", // theme blue (matches palette.primary.main)
        // Staged is a muted/greyed tint of the direction it moves toward.
        stagedIncrease: "#9cbfa0", // greyed green (allocation growing)
        stagedDecrease: "#a3bacd", // greyed blue (allocation shrinking)
      },
      // Credits coin icon.
      credit: {
        light: "#FBBF24",
        main: "#F59E0B",
      },
      // Marker for statement cards with staged (uncommitted) support
      // adjustments — a deep "construction zone" safety orange. Darkened in
      // dark mode so it doesn't glow against the dark surface.
      stagedSupport: {
        light: "#ffa31a",
        dark: "#b35900",
      },
    },
  },
});
