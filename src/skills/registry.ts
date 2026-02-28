/**
 * Skill Registry
 * Manages registration and discovery of skills
 */

import type { Skill } from '../types/index.js';

export interface SkillRegistration {
  skill: Skill;
  builtin: boolean;
  enabled: boolean;
}

/**
 * Registry for agent skills
 */
export class SkillRegistry {
  private skills: Map<string, SkillRegistration>;
  private categories: Map<string, Set<string>>;

  constructor() {
    this.skills = new Map();
    this.categories = new Map();
  }

  /**
   * Register a skill
   */
  register(skill: Skill, builtin: boolean = true): void {
    const registration: SkillRegistration = {
      skill,
      builtin,
      enabled: true,
    };

    this.skills.set(skill.name, registration);

    // Update category index
    if (!this.categories.has(skill.category)) {
      this.categories.set(skill.category, new Set());
    }
    this.categories.get(skill.category)!.add(skill.name);

    // Register aliases
    if (skill.alias) {
      for (const alias of skill.alias) {
        this.skills.set(alias, { ...registration, skill: { ...skill, name: alias } });
      }
    }
  }

  /**
   * Unregister a skill
   */
  unregister(name: string): boolean {
    const registration = this.skills.get(name);

    if (!registration) {
      return false;
    }

    // Remove from category index
    if (registration.skill.name === name) { // Only if it's the primary name
      const category = registration.skill.category;
      this.categories.get(category)?.delete(name);
    }

    this.skills.delete(name);
    return true;
  }

  /**
   * Get a skill by name
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name)?.skill;
  }

  /**
   * Check if a skill exists
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Enable or disable a skill
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const registration = this.skills.get(name);

    if (!registration) {
      return false;
    }

    registration.enabled = enabled;
    return true;
  }

  /**
   * Check if a skill is enabled
   */
  isEnabled(name: string): boolean {
    return this.skills.get(name)?.enabled ?? false;
  }

  /**
   * Get all skills
   */
  getAll(): Skill[] {
    // Deduplicate by primary name
    const seen = new Set<string>();
    const result: Skill[] = [];

    for (const registration of this.skills.values()) {
      if (!seen.has(registration.skill.name)) {
        seen.add(registration.skill.name);
        result.push(registration.skill);
      }
    }

    return result;
  }

  /**
   * Get enabled skills
   */
  getEnabled(): Skill[] {
    return this.getAll().filter(skill => this.isEnabled(skill.name));
  }

  /**
   * Get skills by category
   */
  getByCategory(category: string): Skill[] {
    const skillNames = this.categories.get(category);

    if (!skillNames) {
      return [];
    }

    return Array.from(skillNames)
      .map(name => this.skills.get(name)?.skill)
      .filter((s): s is Skill => s !== undefined && s !== null);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Search skills by name or description
   */
  search(query: string): Skill[] {
    const lowerQuery = query.toLowerCase();

    return this.getAll().filter(
      skill =>
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery) ||
        skill.alias?.some(a => a.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Find skill matching a command
   */
  findMatchingSkill(command: string): Skill | null {
    // Direct name match
    const directMatch = this.get(command);
    if (directMatch) {
      return directMatch;
    }

    // Alias match
    for (const skill of this.getAll()) {
      if (skill.alias?.includes(command)) {
        return skill;
      }
    }

    // Partial name match
    const partialMatches = this.search(command);
    if (partialMatches.length === 1) {
      return partialMatches[0];
    }

    return null;
  }

  /**
   * Clear all skills
   */
  clear(): void {
    this.skills.clear();
    this.categories.clear();
  }

  /**
   * Get skill count
   */
  count(): number {
    // Count unique primary names
    const primaryNames = new Set<string>();
    for (const registration of this.skills.values()) {
      primaryNames.add(registration.skill.name);
    }
    return primaryNames.size;
  }

  /**
   * Export skills as JSON
   */
  export(): string {
    return JSON.stringify(
      this.getAll().map(skill => ({
        name: skill.name,
        description: skill.description,
        alias: skill.alias,
        category: skill.category,
      })),
      null,
      2
    );
  }

  /**
   * Import skills from JSON
   */
  import(json: string): void {
    const skillsData = JSON.parse(json) as Array<{
      name: string;
      description: string;
      alias?: string[];
      category: string;
    }>;

    // Note: This only imports metadata, actual handlers need to be registered separately
    for (const data of skillsData) {
      // Placeholder skill - in production, you'd need to load the actual handler
      const skill: Skill = {
        name: data.name,
        description: data.description,
        alias: data.alias,
        category: data.category,
        handler: async () => {
          throw new Error(`Skill ${data.name} handler not loaded`);
        },
      };

      this.register(skill, false);
    }
  }
}

/**
 * Global skill registry instance
 */
export const skillRegistry = new SkillRegistry();

/**
 * Register a skill
 */
export function registerSkill(skill: Skill, builtin: boolean = true): void {
  skillRegistry.register(skill, builtin);
}

/**
 * Get a skill
 */
export function getSkill(name: string): Skill | undefined {
  return skillRegistry.get(name);
}

/**
 * Get all enabled skills
 */
export function getEnabledSkills(): Skill[] {
  return skillRegistry.getEnabled();
}
