'use strict';

export class Bucket {
	constructor(rate, time) {
		this.lastCheck = Date.now();
		this.allowance = rate;
		this.rate = rate;
		this.time = time;
	}
	
	canSpend(count) {
		this.allowance += (Date.now() - this.lastCheck) / 1000 * (this.rate / this.time);
		this.lastCheck = Date.now();
		if (this.allowance > this.rate) {
			this.allowance = this.rate;
		}
		if (this.allowance < count) {
			return false;
		}
		this.allowance -= count;
		return true;
	}
}
