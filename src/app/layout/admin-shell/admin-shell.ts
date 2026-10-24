import { MatTooltipModule } from '@angular/material/tooltip';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { MatListItem, MatListItemIcon, MatListItemTitle, MatNavList } from '@angular/material/list';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatToolbar } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService, authError } from '../../core/auth/auth-service';
import { AdminAuthorization } from '../../core/auth/admin-authorization';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  imports: [
    RouterOutlet,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    MatSidenavContainer,
    MatSidenav,
    MatSidenavContent,
    MatToolbar,
    MatIcon,
    MatIconButton,
    MatNavList,
    MatListItem,
    MatListItemIcon,
    MatListItemTitle,
    MatDivider,
  ],
  selector: 'app-admin-shell',
  styleUrl: './admin-shell.scss',
  templateUrl: './admin-shell.html',
})
export class AdminShell {
  readonly authorization = inject(AdminAuthorization);
  readonly auth = inject(AuthService);
  readonly correo = computed(() => this.auth.session()?.user.email ?? '');
  readonly iniciales = computed(() => this.correo().slice(0, 2).toUpperCase());
  readonly signingOut = signal(false);
  readonly logoutError = signal('');

  async logout(): Promise<void> {
    this.signingOut.set(true);
    this.logoutError.set('');
    try {
      await this.auth.signOut();
    } catch (error) {
      this.logoutError.set(authError(error));
    } finally {
      this.signingOut.set(false);
    }
  }
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { label: 'Alumnos', path: '/alumnos', icon: 'groups' },
    { label: 'Cuotas y cobros', path: '/cuentas', icon: 'account_balance_wallet' },
    { label: 'Guía de uso', path: '/guia', icon: 'menu_book' },
    { label: 'Configuración', path: '/configuracion', icon: 'settings' },
    { label: 'Te quiero, Rochi ❤️', path: '/te-quiero-rochy', icon: 'favorite' },
  ];

  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 959.98px)').pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  readonly sidenavOpened = signal(true);
  readonly sidenavMode = computed(() => (this.isMobile() ? 'over' : 'side'));

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.currentTitle()),
    ),
    { initialValue: 'Dashboard' },
  );

  constructor() {
    effect(() => this.sidenavOpened.set(!this.isMobile()));
  }

  toggleSidenav(): void {
    this.sidenavOpened.update((opened) => !opened);
  }

  onOpenedChange(opened: boolean): void {
    this.sidenavOpened.set(opened);
  }

  closeIfMobile(): void {
    if (this.isMobile()) {
      this.sidenavOpened.set(false);
    }
  }

  private currentTitle(): string {
    let route = this.router.routerState.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route.snapshot?.title ?? 'Dashboard';
  }
}
