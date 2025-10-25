// Contact Resolver - Resolves attendee names to email addresses
// Uses calendar provider's contact list (Google/Microsoft)

import { logger } from '@imaginecalendar/logger';
import type { ContactResolutionResult, ContactMatch } from './types';

export interface ICalendarService {
  getContacts(userId: string): Promise<Array<{ name: string; email: string; source: 'google' | 'microsoft' }>>;
}

export class ContactResolver {
  constructor(private calendarService: ICalendarService) {}

  async resolve(
    userId: string,
    names: string[]
  ): Promise<ContactResolutionResult> {
    const result: ContactResolutionResult = {
      resolved: {},
      ambiguous: [],
      notFound: [],
      needsClarification: false,
    };

    if (!names || names.length === 0) {
      return result;
    }

    try {
      // Fetch user's contacts from calendar provider
      const contactsWithSource = await this.calendarService.getContacts(userId);

      // Map to ContactMatch format
      const contacts: ContactMatch[] = contactsWithSource.map(c => ({
        name: c.name,
        email: c.email,
        source: c.source,
      }));

      for (const name of names) {
        // Check if the provided value is already an email address
        if (this.isValidEmail(name)) {
          result.resolved[name] = name;
          logger.info({ name }, 'Using email address directly without lookup');
          continue;
        }

        const matches = this.findContactMatches(name, contacts);

        if (matches.length === 0) {
          result.notFound.push(name);
          result.needsClarification = true;
        } else if (matches.length === 1 && matches[0]) {
          result.resolved[name] = matches[0].email;
        } else {
          result.ambiguous.push({
            name,
            matches,
            question: `We found ${matches.length} contacts for "${name}". Which one?\n${matches.map((m, i) => `${i + 1}. ${m.name} (${m.email})`).join('\n')}`,
          });
          result.needsClarification = true;
        }
      }

      logger.info(
        {
          userId,
          totalNames: names.length,
          resolved: Object.keys(result.resolved).length,
          ambiguous: result.ambiguous.length,
          notFound: result.notFound.length,
        },
        'Contact resolution completed'
      );

      return result;
    } catch (error) {
      logger.error({ error, userId }, 'Contact resolution failed');
      // If we can't fetch contacts, mark all as not found
      result.notFound = names;
      result.needsClarification = true;
      return result;
    }
  }

  private isValidEmail(email: string): boolean {
    // Simple email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private findContactMatches(name: string, contacts: ContactMatch[]): ContactMatch[] {
    const nameLower = name.toLowerCase().trim();

    return contacts.filter(contact => {
      const fullName = contact.name.toLowerCase();
      const [firstName, ...lastNames] = fullName.split(' ');
      const lastName = lastNames.join(' ');

      // Match strategies (in order of preference):

      // 1. Exact match on full name
      if (fullName === nameLower) return true;

      // 2. Match first name exactly
      if (firstName === nameLower) return true;

      // 3. Match last name exactly
      if (lastName === nameLower) return true;

      // 4. Match first name + last name initial (e.g., "John S" matches "John Smith")
      if (nameLower.includes(' ')) {
        const [inputFirst, ...inputRest] = nameLower.split(' ');
        const inputLast = inputRest.join(' ');

        if (firstName === inputFirst) {
          if (lastName.startsWith(inputLast)) return true;
        }
      }

      // 5. Partial match (contains)
      if (fullName.includes(nameLower) || (firstName && nameLower.includes(firstName))) {
        return true;
      }

      return false;
    });
  }
}
