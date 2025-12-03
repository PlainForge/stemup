import { createContext } from 'react';
import type { MainContextType } from './MainProvider';

export const MainContext = createContext<MainContextType | undefined>(undefined);