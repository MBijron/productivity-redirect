import { Routes } from '@angular/router';
import { HomePageComponent } from './pages/home-page/home-page.component';
import { WikipediaPageComponent } from './pages/wikipedia-page/wikipedia-page.component';

export const routes: Routes = [
	{
		path: '',
		component: HomePageComponent,
		title: 'Open Elevate'
	},
	{
		path: 'wikipedia',
		component: WikipediaPageComponent,
		title: 'Random Wikipedia'
	},
	{
		path: '**',
		redirectTo: ''
	}
];
