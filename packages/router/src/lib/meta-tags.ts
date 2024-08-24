import { inject } from '@angular/core';
import { Meta, MetaDefinition as NgMetaTag } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  type MaybeAsync,
  NavigationEnd,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { filter, mergeMap } from 'rxjs/operators';
import { from, isObservable, map, Observable, of } from 'rxjs';

export const ROUTE_META_TAGS_KEY = Symbol(
  '@analogjs/router Route Meta Tags Key'
);

const CHARSET_KEY = 'charset';
const HTTP_EQUIV_KEY = 'httpEquiv';
// httpEquiv selector key needs to be in kebab case format
const HTTP_EQUIV_SELECTOR_KEY = 'http-equiv';
const NAME_KEY = 'name';
const PROPERTY_KEY = 'property';
const CONTENT_KEY = 'content';

export type MetaTag =
  | (CharsetMetaTag & ExcludeRestMetaTagKeys<typeof CHARSET_KEY>)
  | (HttpEquivMetaTag & ExcludeRestMetaTagKeys<typeof HTTP_EQUIV_KEY>)
  | (NameMetaTag & ExcludeRestMetaTagKeys<typeof NAME_KEY>)
  | (PropertyMetaTag & ExcludeRestMetaTagKeys<typeof PROPERTY_KEY>);

type CharsetMetaTag = { [CHARSET_KEY]: string };
type HttpEquivMetaTag = { [HTTP_EQUIV_KEY]: string; [CONTENT_KEY]: string };
type NameMetaTag = { [NAME_KEY]: string; [CONTENT_KEY]: string };
type PropertyMetaTag = { [PROPERTY_KEY]: string; [CONTENT_KEY]: string };

type MetaTagKey =
  | typeof CHARSET_KEY
  | typeof HTTP_EQUIV_KEY
  | typeof NAME_KEY
  | typeof PROPERTY_KEY;
type ExcludeRestMetaTagKeys<Key extends MetaTagKey> = {
  [K in Exclude<MetaTagKey, Key>]?: never;
};

type MetaTagSelector =
  | typeof CHARSET_KEY
  | `${
      | typeof HTTP_EQUIV_SELECTOR_KEY
      | typeof NAME_KEY
      | typeof PROPERTY_KEY}="${string}"`;
type MetaTagMap = Record<MetaTagSelector, MetaTag>;

export function updateMetaTagsOnRouteChange(): void {
  const router = inject(Router);
  const metaService = inject(Meta);

  router.events
    .pipe(
      filter((event) => event instanceof NavigationEnd),
      mergeMap(() =>
        getMetaTagMap(
          router.routerState.snapshot.root,
          router.routerState.snapshot
        )
      )
    )
    .subscribe((metaTagMap) => {
      for (const metaTagSelector in metaTagMap) {
        const metaTag = metaTagMap[
          metaTagSelector as MetaTagSelector
        ] as NgMetaTag;
        metaService.updateTag(metaTag, metaTagSelector);
      }
    });
}

function getMetaTagMap(
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<MetaTagMap> {
  return getMetaTagMapRecursive(route, state).pipe(
    map((metaTags) =>
      metaTags.reduce((metaTagMap, metaTag) => {
        metaTagMap[getMetaTagSelector(metaTag)] = metaTag;
        return metaTagMap;
      }, {} as MetaTagMap)
    )
  );
}

function getMetaTagMapRecursive(
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<MetaTag[]> {
  const metaTagsOrFn = route.data[ROUTE_META_TAGS_KEY];
  const metaTags$ = resolveMetaTags(metaTagsOrFn, route, state);
  return metaTags$.pipe(
    mergeMap((metaTags) => {
      if (route.firstChild) {
        return getMetaTagMapRecursive(route.firstChild, state).pipe(
          map((childMetaTags) => [...metaTags, ...childMetaTags])
        );
      }
      return of(metaTags);
    })
  );
}

function getMetaTagSelector(metaTag: MetaTag): MetaTagSelector {
  if (metaTag.name) {
    return `${NAME_KEY}="${metaTag.name}"`;
  }

  if (metaTag.property) {
    return `${PROPERTY_KEY}="${metaTag.property}"`;
  }

  if (metaTag.httpEquiv) {
    return `${HTTP_EQUIV_SELECTOR_KEY}="${metaTag.httpEquiv}"`;
  }

  return CHARSET_KEY;
}

function resolveMetaTags(
  metaTagsOrFn: any,
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Observable<MetaTag[]> {
  if (typeof metaTagsOrFn !== 'function') {
    return of(metaTagsOrFn ?? []);
  }

  const result = metaTagsOrFn(route, state) as MaybeAsync<MetaTag[]>;
  if (isObservable(result)) {
    return result;
  }

  return 'then' in result ? from(result) : of(result);
}
