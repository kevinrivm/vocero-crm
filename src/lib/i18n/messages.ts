import type { Locale } from "./locale";
import { es as extraEs, ptBR as extraPt } from "./catalogs/additional";
import { es as es0, ptBR as pt0 } from "./catalogs/common";
import { es as es1, ptBR as pt1 } from "./catalogs/settings";
import { es as es2, ptBR as pt2 } from "./catalogs/agent";
import { es as es3, ptBR as pt3 } from "./catalogs/agenda";
import { es as es4, ptBR as pt4 } from "./catalogs/contacts";
import { es as es5, ptBR as pt5 } from "./catalogs/inbox";
import { es as es6, ptBR as pt6 } from "./catalogs/lab";
import { es as es7, ptBR as pt7 } from "./catalogs/onboarding";
import { es as es8, ptBR as pt8 } from "./catalogs/pipeline";
import { es as es9, ptBR as pt9 } from "./catalogs/results";
export const es = {...extraEs,...es0,...es1,...es2,...es3,...es4,...es5,...es6,...es7,...es8,...es9} as const;
export type MessageKey = keyof typeof es;
export const ptBR: Record<MessageKey, string> = {...extraPt,...pt0,...pt1,...pt2,...pt3,...pt4,...pt5,...pt6,...pt7,...pt8,...pt9};

export const catalogs: Record<Locale, Readonly<Record<MessageKey, string>>> = { es, "pt-BR": ptBR };
